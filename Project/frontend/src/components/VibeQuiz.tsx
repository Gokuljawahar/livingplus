// VibeCheck questions (DESIGN.md: chunked, sentence case, 44px targets).
// Lifestyle habits only; the questions live in @livingplus/shared.
import { VIBE_QUESTIONS, type VibeAnswers, type VibeQuestion } from '@livingplus/shared';
import { usePlatformCatalog } from '../hooks/usePlatformCatalog';

interface VibeQuizProps {
  value: VibeAnswers;
  onChange: (next: VibeAnswers) => void;
  /** Topics that don't apply at this PG (no shared kitchen, no AC), as from vibeTopicsFor. */
  skip?: string[];
  questions?: readonly VibeQuestion[];
}

export default function VibeQuiz({ value, onChange, skip = [], questions: explicitQuestions }: VibeQuizProps) {
  const { catalog } = usePlatformCatalog();
  const sourceQuestions = explicitQuestions ?? (catalog.vibeQuestions.length ? catalog.vibeQuestions : VIBE_QUESTIONS);
  const questions = sourceQuestions.filter((question) => !skip.includes(question.id));
  const answered = questions.filter((question) => value[question.id] !== undefined).length;
  return (
    <div className="space-y-5">
      <p className="tabular text-sm text-muted" aria-live="polite">{answered} of {questions.length} answered</p>
      {questions.map((question) => (
        <fieldset key={question.id}>
          <legend className="font-medium text-navy-900">{question.question}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {question.options.map((option) => {
              const checked = value[question.id] === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex min-h-11 cursor-pointer items-center rounded-[10px] border px-3 py-2 text-[15px] ${checked ? 'border-navy-900 bg-amber-50 font-medium text-navy-900' : 'border-hairline bg-white text-ink hover:border-field-border'}`}
                >
                  <input
                    type="radio"
                    name={`vibe-${question.id}`}
                    value={option.value}
                    checked={checked}
                    onChange={() => onChange({ ...value, [question.id]: option.value })}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
