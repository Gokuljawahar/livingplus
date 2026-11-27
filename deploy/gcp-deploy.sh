#!/usr/bin/env bash
# Deploys LivingPlus to Google Cloud as one Cloud Run service:
#   Cloud Run (API + frontend) · Cloud SQL for PostgreSQL · Cloud Storage
#   Secret Manager · Cloud Scheduler · Vertex AI / Gemini
#
# Idempotent: re-running creates only what is missing, then rebuilds and
# redeploys. DRY_RUN=1 prints every command without running anything.
#
# Usage (from the repository root, signed in with gcloud):
#   deploy/gcp-deploy.sh
# Optional settings (environment variables):
#   PROJECT_ID           default: gcloud config project
#   REGION               default: asia-south1 (Mumbai)
#   GOOGLE_API_KEY       optional Gemini API key. Not needed: chat and semantic
#                        search embeddings use Vertex AI with the service account.
#   WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID
#                        Meta WhatsApp Cloud API: outbound updates and the inbound
#                        assistant (webhook: <service URL>/webhooks/whatsapp). The
#                        verify token is generated into Secret Manager and printed.
#   ALERT_EMAIL          email for Cloud Monitoring alerts (site down, server errors);
#                        without it, incidents still show in the Cloud Console.
#   AI_MODEL             default: google:gemini-3.8-flash (stable, tool calling and
#                        structured output, high default quota). gemini-4-hydrogen
#                        also works but new projects get a very low per-minute quota
#                        (429s on multi-step tool calls) until it is raised.
#   AI_MODEL_OPTIONS     default: {"thinkingConfig":{"thinkingLevel":"LOW"}} (Gemini 4
#                        thinks at HIGH by default; LOW keeps chat and voice-adjacent flows fast,
#                        and slow answers fall back to AI_FALLBACK_MODEL after 12 s)
#   AI_BACKEND=vertex|studio  default vertex (Vertex AI with the service account,
#                        billed to the project). studio uses a Google AI Studio key
#                        instead: set GOOGLE_API_KEY too (stored in Secret Manager).
#   SKIP_FIREBASE=1      don't look up Firebase; use OTP demo mode (codes on screen).
#                        Use it on a fresh project without Firebase set up.
#   FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_APP_ID
#                        Firebase Phone Auth. Read automatically from the project's
#                        Firebase web app when not set; with no Firebase app, OTP demo
#                        mode (codes shown on screen) is turned on.
#   ENABLE_GOOGLE_SIGN_IN=true|false  "Sign in with Google" for owners and wardens;
#                        defaults to on when Firebase's Google provider is enabled.
#   DEMO_OTP_CODE        fixed code for the demo residents' Firebase test phone
#                        numbers (with SEED_DEMO_DATA=1; default 246810).
#   VITE_GOOGLE_MAPS_API_KEY  map picker in the owner workspace
#   SQL_TIER             default: db-f1-micro (smallest; fine for a demo)
#   SEED_DEMO_DATA=1     load the fictional demo PGs, rooms and residents once,
#                        owned by a demo owner (DEMO_OWNER_PHONE, default 9555500001;
#                        password generated into Secret Manager)
#
# There is no platform super admin: every PG is its owner's workspace, isolated
# by PostgreSQL Row-Level Security.
set -euo pipefail
# Never wait for interactive answers (e.g. "enable this API?"): fail clearly instead.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-livingplus}"
REPO="${REPO:-livingplus}"
SQL_INSTANCE="${SQL_INSTANCE:-livingplus-db2}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
DB_NAME="${DB_NAME:-livingplus}"
DB_USER="${DB_USER:-livingplus}"
BUCKET="${BUCKET:-${PROJECT_ID}-livingplus-uploads}"
SA_NAME="${SA_NAME:-livingplus-run}"
AI_MODEL="${AI_MODEL:-google:gemini-3.8-flash}"
if [ -z "${AI_MODEL_OPTIONS:-}" ]; then AI_MODEL_OPTIONS='{"thinkingConfig":{"thinkingLevel":"LOW"}}'; fi
# Gemini models are served from the "global" Vertex AI location; not every model is in every region.
AI_LOCATION="${AI_LOCATION:-global}"
AI_BACKEND="${AI_BACKEND:-vertex}"
case "$AI_BACKEND" in
  vertex) ;;
  studio) [ -n "${GOOGLE_API_KEY:-}" ] || { echo "AI_BACKEND=studio needs GOOGLE_API_KEY (from https://aistudio.google.com/apikey)." >&2; exit 1; } ;;
  *) echo "AI_BACKEND must be vertex or studio." >&2; exit 1 ;;
esac
DEMO_OWNER_PHONE="${DEMO_OWNER_PHONE:-9555500001}"
DRY_RUN="${DRY_RUN:-0}"

[ -n "$PROJECT_ID" ] || { echo "Set PROJECT_ID or run: gcloud config set project <id>" >&2; exit 1; }
[ -f deploy/cloudbuild.yaml ] || { echo "Run from the repository root." >&2; exit 1; }

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(date +%Y%m%d-%H%M%S)}"
SQL_CONNECTION="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"

step() { printf '\n==> %s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*" >&2; else "$@"; fi
}
exists() { "$@" >/dev/null 2>&1; }
random_secret() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-40}"; }
random_hex() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

# Creates a Secret Manager secret with the given value unless it exists.
ensure_secret() {
  local name="$1" value="$2"
  if exists gcloud secrets describe "$name" --project "$PROJECT_ID"; then
    echo "  secret $name exists (kept)"
  elif [ "$DRY_RUN" = "1" ]; then
    printf '  [dry-run] create secret %s\n' "$name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT_ID" --replication-policy automatic --data-file=- >/dev/null
    echo "  secret $name created"
  fi
}
secret_value() {
  if [ "$DRY_RUN" = "1" ]; then echo "dry-run-value"; else gcloud secrets versions access latest --secret "$1" --project "$PROJECT_ID"; fi
}

echo "Deploying LivingPlus to project ${PROJECT_ID}, region ${REGION}${DRY_RUN:+ (DRY_RUN=$DRY_RUN)}"

step "Enabling Google Cloud APIs"
run gcloud services enable --project "$PROJECT_ID" \
  run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com aiplatform.googleapis.com \
  storage.googleapis.com iamcredentials.googleapis.com monitoring.googleapis.com logging.googleapis.com

step "Service account ${SA_EMAIL}"
exists gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" \
  || run gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" --display-name "LivingPlus Cloud Run"
for role in roles/cloudsql.client roles/aiplatform.user roles/secretmanager.secretAccessor roles/logging.logWriter; do
  run gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${SA_EMAIL}" --role "$role" --condition None --quiet >/dev/null
done
# Signing Cloud Storage URLs without a key file uses the IAM signBlob API on itself.
run gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --project "$PROJECT_ID" \
  --member "serviceAccount:${SA_EMAIL}" --role roles/iam.serviceAccountTokenCreator --quiet >/dev/null

step "Artifact Registry repository ${REPO}"
exists gcloud artifacts repositories describe "$REPO" --location "$REGION" --project "$PROJECT_ID" \
  || run gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" --project "$PROJECT_ID"

step "Cloud Storage bucket gs://${BUCKET} (private)"
exists gcloud storage buckets describe "gs://${BUCKET}" --project "$PROJECT_ID" \
  || run gcloud storage buckets create "gs://${BUCKET}" --project "$PROJECT_ID" --location "$REGION" \
       --uniform-bucket-level-access --public-access-prevention
run gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member "serviceAccount:${SA_EMAIL}" --role roles/storage.objectAdmin >/dev/null

step "Secrets"
ensure_secret livingplus-jwt-secret "$(random_hex)"
ensure_secret livingplus-demo-owner-password "$(random_secret 20)"
ensure_secret livingplus-db-password "$(random_secret 32)"
if [ -n "${GOOGLE_API_KEY:-}" ]; then ensure_secret livingplus-google-api-key "$GOOGLE_API_KEY"; fi
if [ -n "${WHATSAPP_TOKEN:-}" ]; then
  ensure_secret livingplus-whatsapp-token "$WHATSAPP_TOKEN"
  ensure_secret livingplus-whatsapp-app-secret "${WHATSAPP_APP_SECRET:?Set WHATSAPP_APP_SECRET with WHATSAPP_TOKEN}"
  ensure_secret livingplus-whatsapp-verify-token "$(random_secret 24)"
fi

step "Cloud SQL for PostgreSQL ${SQL_INSTANCE} (${SQL_TIER}; first creation takes several minutes)"
exists gcloud sql instances describe "$SQL_INSTANCE" --project "$PROJECT_ID" \
  || run gcloud sql instances create "$SQL_INSTANCE" --project "$PROJECT_ID" --region "$REGION" \
       --database-version POSTGRES_18 --edition ENTERPRISE --tier "$SQL_TIER" --storage-auto-increase
exists gcloud sql databases describe "$DB_NAME" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" \
  || run gcloud sql databases create "$DB_NAME" --instance "$SQL_INSTANCE" --project "$PROJECT_ID"
DB_PASSWORD="$(secret_value livingplus-db-password)"
if gcloud sql users list --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --format 'value(name)' 2>/dev/null | grep -qx "$DB_USER"; then
  run gcloud sql users set-password "$DB_USER" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --password "$DB_PASSWORD"
else
  run gcloud sql users create "$DB_USER" --instance "$SQL_INSTANCE" --project "$PROJECT_ID" --password "$DB_PASSWORD"
fi
# Prisma and node-postgres both reach Cloud SQL through the Cloud Run unix socket.
EXPECTED_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION}"
ensure_secret livingplus-database-url "$EXPECTED_DB_URL"
if [ "$DRY_RUN" != "1" ] && [ "$(secret_value livingplus-database-url)" != "$EXPECTED_DB_URL" ]; then
  printf '%s' "$EXPECTED_DB_URL" | gcloud secrets versions add livingplus-database-url --project "$PROJECT_ID" --data-file=- >/dev/null
  echo "  secret livingplus-database-url updated to ${SQL_CONNECTION}"
fi

# Reads a value from a Firebase / Identity Toolkit / App Check REST endpoint (read-only).
firebase_get() {
  curl -fsS -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" \
    -H "x-goog-user-project: ${PROJECT_ID}" "$1" 2>/dev/null
}

if [ "${SKIP_FIREBASE:-0}" != "1" ] && [ -z "${VITE_RECAPTCHA_SITE_KEY:-}" ] && [ "$DRY_RUN" != "1" ]; then
  if RC_APP_ID="$(firebase_get "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps" | python3 -c 'import sys,json; a=json.load(sys.stdin).get("apps",[]); print(a[0]["appId"] if a else "")' 2>/dev/null)" && [ -n "$RC_APP_ID" ]; then
    PROJECT_NUM="${RC_APP_ID%%:*}"
    RC_SITE_KEY="$(firebase_get "https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUM}/apps/${RC_APP_ID}/recaptchaEnterpriseConfig" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("siteKey") or "").split("/")[-1])' 2>/dev/null || true)"
    if [ -n "$RC_SITE_KEY" ]; then
      VITE_RECAPTCHA_SITE_KEY="$RC_SITE_KEY"
      VITE_RECAPTCHA_ENTERPRISE="${VITE_RECAPTCHA_ENTERPRISE:-true}"
      echo "  using Firebase App Check reCAPTCHA Enterprise key ${VITE_RECAPTCHA_SITE_KEY}"
    fi
  fi
fi

step "Building the image with Cloud Build"
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "  SKIP_BUILD=1: reusing existing image ${IMAGE}"
else
  run gcloud builds submit --project "$PROJECT_ID" --region "$REGION" --config deploy/cloudbuild.yaml \
    --substitutions "_IMAGE=${IMAGE},_VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-},_VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY:-},_VITE_RECAPTCHA_ENTERPRISE=${VITE_RECAPTCHA_ENTERPRISE:-}" .
fi

step "Firebase Authentication"
if [ "${SKIP_FIREBASE:-0}" = "1" ]; then
  echo "  SKIP_FIREBASE=1: not using Firebase."
  FIREBASE_PROJECT_ID=""; FIREBASE_WEB_API_KEY=""
elif [ -z "${FIREBASE_PROJECT_ID:-}" ]; then
  # A failed lookup must stop the deploy: falling back to OTP demo mode would
  # silently switch a live site to on-screen codes. Only "no Firebase app" means demo mode.
  if ! FB_APPS_JSON="$(firebase_get "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps")"; then
    echo "Could not read Firebase apps for ${PROJECT_ID} (network, quota or permissions)." >&2
    echo "Retry, or pass FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY and FIREBASE_APP_ID explicitly." >&2
    exit 1
  fi
  FB_APP_ID="$(printf '%s' "$FB_APPS_JSON" | python3 -c 'import sys,json; a=json.load(sys.stdin).get("apps",[]); print(a[0]["appId"] if a else "")')"
  if [ -n "$FB_APP_ID" ]; then
    read -r FIREBASE_PROJECT_ID FIREBASE_WEB_API_KEY FIREBASE_APP_ID < <(
      firebase_get "https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}/webApps/${FB_APP_ID}/config" \
        | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["projectId"], d["apiKey"], d["appId"])')
    echo "  using Firebase web app ${FIREBASE_APP_ID}"
  fi
fi
if [ -n "${FIREBASE_PROJECT_ID:-}" ] && [ -z "${ENABLE_GOOGLE_SIGN_IN:-}" ]; then
  ENABLE_GOOGLE_SIGN_IN="$(firebase_get "https://identitytoolkit.googleapis.com/admin/v2/projects/${FIREBASE_PROJECT_ID}/defaultSupportedIdpConfigs" \
    | python3 -c 'import sys,json; print("true" if any(c["name"].endswith("/google.com") and c.get("enabled") for c in json.load(sys.stdin).get("defaultSupportedIdpConfigs",[])) else "false")' 2>/dev/null || echo false)"
  echo "  Google sign-in: ${ENABLE_GOOGLE_SIGN_IN} (follows the Firebase Google provider)"
fi

step "Deploying Cloud Run service ${SERVICE}"
ENV_VARS="APP_TIMEZONE=Asia/Kolkata,UPLOAD_STORAGE=gcs,GCS_BUCKET=${BUCKET},LOG_LEVEL=info"
ENV_VARS+=",ENABLE_AI_ORCHESTRATOR=true,AI_MODEL=${AI_MODEL},AI_MODEL_OPTIONS=${AI_MODEL_OPTIONS}"
if [ "$AI_BACKEND" = "vertex" ]; then
  # Chat, voice, KYC, VibeCheck and search embeddings on Vertex AI with the service account (no API key).
  ENV_VARS+=",GOOGLE_GENAI_USE_ENTERPRISE=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${AI_LOCATION}"
  ENV_VARS+=",ENABLE_SEMANTIC_SEARCH=true,AI_EMBEDDING_MODEL=google-vertexai:gemini-embedding-001"
else
  # The same features on the Gemini API with the AI Studio key (GOOGLE_API_KEY secret below).
  ENV_VARS+=",GOOGLE_GENAI_USE_ENTERPRISE=false"
  ENV_VARS+=",ENABLE_SEMANTIC_SEARCH=true,AI_EMBEDDING_MODEL=google-genai:gemini-embedding-001"
fi
SECRETS="DATABASE_URL=livingplus-database-url:latest,JWT_SECRET=livingplus-jwt-secret:latest"
if [ -n "${GOOGLE_API_KEY:-}" ]; then SECRETS+=",GOOGLE_API_KEY=livingplus-google-api-key:latest"; fi
if [ -n "${WHATSAPP_TOKEN:-}" ]; then
  ENV_VARS+=",ENABLE_WHATSAPP_CLOUD_API=true,WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_NUMBER_ID:?Set WHATSAPP_PHONE_NUMBER_ID}"
  SECRETS+=",WHATSAPP_TOKEN=livingplus-whatsapp-token:latest,WHATSAPP_APP_SECRET=livingplus-whatsapp-app-secret:latest,WHATSAPP_VERIFY_TOKEN=livingplus-whatsapp-verify-token:latest"
fi
if [ -n "${FIREBASE_PROJECT_ID:-}" ] && [ -n "${FIREBASE_WEB_API_KEY:-}" ]; then
  ENV_VARS+=",OTP_PROVIDER=firebase,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY},FIREBASE_APP_ID=${FIREBASE_APP_ID:-}"
  if [ "${ENABLE_GOOGLE_SIGN_IN:-false}" = "true" ]; then
    ENV_VARS+=",ENABLE_GOOGLE_SIGN_IN=true"
  fi
else
  echo "  No Firebase config: enabling OTP demo mode (codes shown on screen)."
  ENV_VARS+=",OTP_DEMO_MODE=true"
fi
run gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
  --service-account "$SA_EMAIL" --set-cloudsql-instances "$SQL_CONNECTION" --allow-unauthenticated \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 3 --timeout 300 \
  --set-env-vars "$ENV_VARS" --set-secrets "$SECRETS"

if [ "$DRY_RUN" = "1" ]; then URL="https://${SERVICE}-example.a.run.app"; else
  URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
fi
HOST="${URL#https://}"
step "Pointing the service at its own URL (${URL})"
run gcloud run services update "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --update-env-vars "LIVINGPLUS_ROOT_DOMAIN=${HOST},FRONTEND_URL=${URL},PUBLIC_API_URL=${URL},CRON_OIDC_AUDIENCE=${URL},CRON_SERVICE_ACCOUNT=${SA_EMAIL}"

step "Cloud Scheduler jobs (signed with ${SA_EMAIL})"
schedule() {
  local name="$1" cron="$2" path="$3" action=create
  exists gcloud scheduler jobs describe "$name" --location "$REGION" --project "$PROJECT_ID" && action=update
  run gcloud scheduler jobs "$action" http "$name" --project "$PROJECT_ID" --location "$REGION" \
    --schedule "$cron" --time-zone Asia/Kolkata --http-method POST --uri "${URL}${path}" \
    --oidc-service-account-email "$SA_EMAIL" --oidc-token-audience "$URL"
}
schedule livingplus-monthly-rent "5 0 1 * *" /internal/cron/monthly-rent
schedule livingplus-rent-reminders "0 10 * * *" /internal/cron/rent-reminders
schedule livingplus-search-index "15 * * * *" /internal/cron/search-index

if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
  step "Loading demo data (one-off Cloud Run job)"
  run gcloud run jobs deploy livingplus-seed --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
    --service-account "$SA_EMAIL" --set-cloudsql-instances "$SQL_CONNECTION" \
    --set-secrets DATABASE_URL=livingplus-database-url:latest,DEMO_OWNER_PASSWORD=livingplus-demo-owner-password:latest \
    --set-env-vars "DEMO_OWNER_PHONE=${DEMO_OWNER_PHONE}" \
    --command node --args prisma/seed-pg.js --max-retries 0 --task-timeout 600
  run gcloud run jobs execute livingplus-seed --project "$PROJECT_ID" --region "$REGION" --wait
  run gcloud scheduler jobs run livingplus-search-index --project "$PROJECT_ID" --location "$REGION"

  # The demo residents' numbers are fictional, so real SMS can never reach them.
  # Register them as Firebase test phone numbers (fixed code, no SMS), keeping any
  # test numbers already configured.
  if [ -n "${FIREBASE_PROJECT_ID:-}" ]; then
    step "Firebase test phone numbers for the demo residents"
    DEMO_OTP_CODE="${DEMO_OTP_CODE:-246810}"
    FB_CONFIG_URL="https://identitytoolkit.googleapis.com/admin/v2/projects/${FIREBASE_PROJECT_ID}/config"
    TEST_NUMBERS="$(firebase_get "$FB_CONFIG_URL" | DEMO_OTP_CODE="$DEMO_OTP_CODE" python3 -c '
import json, os, sys
current = json.load(sys.stdin).get("signIn", {}).get("phoneNumber", {}).get("testPhoneNumbers", {}) or {}
for phone in ("+919000000001", "+919000000002"):
    current.setdefault(phone, os.environ["DEMO_OTP_CODE"])
print(json.dumps({"signIn": {"phoneNumber": {"enabled": True, "testPhoneNumbers": current}}}))')"
    if [ "$DRY_RUN" = "1" ]; then
      echo "  [dry-run] PATCH ${FB_CONFIG_URL} (test phone numbers)" >&2
    else
      curl -fsS -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token 2>/dev/null)" \
        -H "x-goog-user-project: ${PROJECT_ID}" -H "content-type: application/json" \
        "${FB_CONFIG_URL}?updateMask=signIn.phoneNumber.testPhoneNumbers" -d "$TEST_NUMBERS" -o /dev/null
    fi
    # Existing test numbers keep their codes; report what Firebase will actually accept.
    printf '%s' "$TEST_NUMBERS" | python3 -c '
import json, sys
numbers = json.load(sys.stdin)["signIn"]["phoneNumber"]["testPhoneNumbers"]
for phone in ("+919000000001", "+919000000002"):
    print(f"  demo resident {phone[3:]} signs in with code {numbers[phone]} (no SMS)")'
  fi
fi

step "Cloud Monitoring: uptime check and alerts"
# Optional: the app is already live, so a monitoring problem (API still enabling,
# missing permission) only warns instead of failing the deploy.
setup_monitoring() {
  set +e +o pipefail
UPTIME_NAME="${SERVICE} health"
CHECK_ID="$(gcloud monitoring uptime list-configs --project "$PROJECT_ID" --filter "displayName=\"${UPTIME_NAME}\"" --format 'value(name.basename())' 2>/dev/null | head -1)"
if [ -z "$CHECK_ID" ]; then
  run gcloud monitoring uptime create "$UPTIME_NAME" --project "$PROJECT_ID" \
    --resource-type uptime-url --resource-labels "host=${HOST},project_id=${PROJECT_ID}" \
    --protocol https --path /health --period 5 --timeout 10 --matcher-content '"ok":true' --matcher-type contains-string
  CHECK_ID="$(gcloud monitoring uptime list-configs --project "$PROJECT_ID" --filter "displayName=\"${UPTIME_NAME}\"" --format 'value(name.basename())' 2>/dev/null | head -1)"
else
  echo "  uptime check exists (kept)"
fi
[ -n "$CHECK_ID" ] || CHECK_ID="dry-run-check-id"

ERROR_METRIC="${SERVICE}-server-errors"
exists gcloud logging metrics describe "$ERROR_METRIC" --project "$PROJECT_ID" \
  || run gcloud logging metrics create "$ERROR_METRIC" --project "$PROJECT_ID" \
    --description "Error-level log entries from the ${SERVICE} Cloud Run service" \
    --log-filter "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND severity>=ERROR"

CHANNELS="[]"
if [ -n "${ALERT_EMAIL:-}" ]; then
  CHANNEL="$(gcloud beta monitoring channels list --project "$PROJECT_ID" --filter "labels.email_address=\"${ALERT_EMAIL}\"" --format 'value(name)' 2>/dev/null | head -1 || true)"
  if [ -z "$CHANNEL" ] && [ "$DRY_RUN" != "1" ]; then
    CHANNEL="$(gcloud beta monitoring channels create --project "$PROJECT_ID" --display-name "${SERVICE} alerts" \
      --type email --channel-labels "email_address=${ALERT_EMAIL}" --format 'value(name)' 2>/dev/null || true)"
  fi
  if [ -n "$CHANNEL" ]; then CHANNELS="[\"${CHANNEL}\"]"; else echo "  could not set up the alert email channel; alerts stay visible in the console"; fi
fi

POLICY_NAME="${SERVICE}: site down or server errors"
if exists_policy="$(gcloud monitoring policies list --project "$PROJECT_ID" --filter "displayName=\"${POLICY_NAME}\"" --format 'value(name)' 2>/dev/null)" && [ -n "$exists_policy" ]; then
  echo "  alert policy exists (kept)"
else
  POLICY_FILE="$(mktemp)"
  cat > "$POLICY_FILE" <<POLICY
{
  "displayName": "${POLICY_NAME}",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Health check failing",
      "conditionThreshold": {
        "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${CHECK_ID}\"",
        "aggregations": [{ "alignmentPeriod": "1200s", "perSeriesAligner": "ALIGN_NEXT_OLDER", "crossSeriesReducer": "REDUCE_COUNT_FALSE", "groupByFields": ["resource.label.host"] }],
        "comparison": "COMPARISON_GT", "thresholdValue": 1, "duration": "300s", "trigger": { "count": 1 }
      }
    },
    {
      "displayName": "More than 5 server errors in 5 minutes",
      "conditionThreshold": {
        "filter": "metric.type=\"logging.googleapis.com/user/${ERROR_METRIC}\" AND resource.type=\"cloud_run_revision\"",
        "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }],
        "comparison": "COMPARISON_GT", "thresholdValue": 5, "duration": "0s", "trigger": { "count": 1 }
      }
    }
  ],
  "notificationChannels": ${CHANNELS}
}
POLICY
  run gcloud monitoring policies create --project "$PROJECT_ID" --policy-from-file "$POLICY_FILE"
  rm -f "$POLICY_FILE"
fi
}
if ! (setup_monitoring); then
  echo "  warning: monitoring setup did not finish; the site is deployed. Re-run later to add alerts." >&2
fi

cat <<EOF

LivingPlus is deployed: ${URL}
  Guests:              ${URL}/
  Residents:           ${URL}/stay
  Owner sign-in:       ${URL}/owner/login   (demo owner, if seeded: ${DEMO_OWNER_PHONE})
  Demo owner password: gcloud secrets versions access latest --secret livingplus-demo-owner-password --project ${PROJECT_ID}
  WhatsApp webhook:    ${URL}/webhooks/whatsapp   (verify token: gcloud secrets versions access latest --secret livingplus-whatsapp-verify-token --project ${PROJECT_ID})
  Logs:                gcloud run services logs read ${SERVICE} --project ${PROJECT_ID} --region ${REGION}
EOF
