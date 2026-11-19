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
#   GOOGLE_API_KEY       Gemini API key; enables semantic search embeddings.
#                        Without it, chat uses Vertex AI with the service account.
#   AI_MODEL             default: google:gemini-3.8-flash
#   FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY, FIREBASE_APP_ID
#                        enable Firebase Phone Auth; without them, OTP demo mode
#                        (codes shown on screen) is turned on.
#   VITE_GOOGLE_MAPS_API_KEY  map picker in the owner workspace
#   SQL_TIER             default: db-f1-micro (smallest; fine for a demo)
#   SEED_DEMO_DATA=1     load the fictional demo PGs, rooms and residents once
set -euo pipefail
# Never wait for interactive answers (e.g. "enable this API?"): fail clearly instead.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-livingplus}"
REPO="${REPO:-livingplus}"
SQL_INSTANCE="${SQL_INSTANCE:-livingplus-db}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
DB_NAME="${DB_NAME:-livingplus}"
DB_USER="${DB_USER:-livingplus}"
BUCKET="${BUCKET:-${PROJECT_ID}-livingplus-uploads}"
SA_NAME="${SA_NAME:-livingplus-run}"
AI_MODEL="${AI_MODEL:-google:gemini-3.8-flash}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
DRY_RUN="${DRY_RUN:-0}"

[ -n "$PROJECT_ID" ] || { echo "Set PROJECT_ID or run: gcloud config set project <id>" >&2; exit 1; }
[ -f deploy/cloudbuild.yaml ] || { echo "Run from the repository root." >&2; exit 1; }

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(date +%Y%m%d-%H%M%S)"
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
  storage.googleapis.com iamcredentials.googleapis.com

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
ensure_secret livingplus-encryption-key "$(random_hex)"
ensure_secret livingplus-admin-password "$(random_secret 20)"
ensure_secret livingplus-db-password "$(random_secret 32)"
if [ -n "${GOOGLE_API_KEY:-}" ]; then ensure_secret livingplus-google-api-key "$GOOGLE_API_KEY"; fi

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
ensure_secret livingplus-database-url "postgresql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?host=/cloudsql/${SQL_CONNECTION}"

step "Building the image with Cloud Build"
BUILD_SA="$(gcloud builds get-default-service-account --project "$PROJECT_ID" --format 'value(serviceAccountEmail)' 2>/dev/null | sed 's#.*/##' || true)"
if [ -n "$BUILD_SA" ]; then
  run gcloud secrets add-iam-policy-binding livingplus-encryption-key --project "$PROJECT_ID" \
    --member "serviceAccount:${BUILD_SA}" --role roles/secretmanager.secretAccessor >/dev/null
fi
run gcloud builds submit --project "$PROJECT_ID" --region "$REGION" --config deploy/cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY:-}" .

step "Deploying Cloud Run service ${SERVICE}"
ENV_VARS="APP_TIMEZONE=Asia/Kolkata,GCS_BUCKET=${BUCKET},ADMIN_USERNAME=${ADMIN_USERNAME},LOG_LEVEL=info"
ENV_VARS+=",ENABLE_AI_ORCHESTRATOR=true,AI_MODEL=${AI_MODEL}"
SECRETS="DATABASE_URL=livingplus-database-url:latest,JWT_SECRET=livingplus-jwt-secret:latest"
SECRETS+=",ENCRYPTION_KEY=livingplus-encryption-key:latest,ADMIN_PASSWORD=livingplus-admin-password:latest"
if [ -n "${GOOGLE_API_KEY:-}" ]; then
  ENV_VARS+=",ENABLE_SEMANTIC_SEARCH=true,AI_EMBEDDING_MODEL=google-genai:gemini-embedding-001"
  SECRETS+=",GOOGLE_API_KEY=livingplus-google-api-key:latest"
fi
if [ -n "${FIREBASE_PROJECT_ID:-}" ] && [ -n "${FIREBASE_WEB_API_KEY:-}" ]; then
  ENV_VARS+=",OTP_PROVIDER=firebase,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY},FIREBASE_APP_ID=${FIREBASE_APP_ID:-}"
else
  echo "  No Firebase config: enabling OTP demo mode (codes shown on screen)."
  ENV_VARS+=",OTP_DEMO_MODE=true"
fi
run gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
  --service-account "$SA_EMAIL" --add-cloudsql-instances "$SQL_CONNECTION" --allow-unauthenticated \
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
if [ -n "${GOOGLE_API_KEY:-}" ]; then schedule livingplus-search-index "15 * * * *" /internal/cron/search-index; fi

if [ "${SEED_DEMO_DATA:-0}" = "1" ]; then
  step "Loading demo data (one-off Cloud Run job)"
  run gcloud run jobs deploy livingplus-seed --project "$PROJECT_ID" --region "$REGION" --image "$IMAGE" \
    --service-account "$SA_EMAIL" --set-cloudsql-instances "$SQL_CONNECTION" \
    --set-secrets DATABASE_URL=livingplus-database-url:latest \
    --command node --args prisma/seed-pg.js --max-retries 0 --task-timeout 600
  run gcloud run jobs execute livingplus-seed --project "$PROJECT_ID" --region "$REGION" --wait
  if [ -n "${GOOGLE_API_KEY:-}" ]; then
    run gcloud scheduler jobs run livingplus-search-index --project "$PROJECT_ID" --location "$REGION"
  fi
fi

cat <<EOF

LivingPlus is deployed: ${URL}
  Owner/admin sign-in: ${URL}/login   (platform admin: ${ADMIN_USERNAME})
  Admin password:      gcloud secrets versions access latest --secret livingplus-admin-password --project ${PROJECT_ID}
  Logs:                gcloud run services logs read ${SERVICE} --project ${PROJECT_ID} --region ${REGION}
EOF
