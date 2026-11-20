// VibeCheck questions (DESIGN.md: chunked, sentence case, 44px targets).
// Lifestyle habits only; the questions live in @livingplus/shared.
import { VIBE_QUESTIONS, type VibeAnswers } from '@livingplus/shared';

interface VibeQuizProps {
  value: VibeAnswers;
  onChange: (next: VibeAnswers) => void;
}

export default function VibeQuiz({ value, onChange }: VibeQuizProps) {
  const answered = VIBE_QUESTIONS.filter((question) => value[question.id] !== undefined).length;
  return (
    <div className="space-y-5">
      <p className="tabular text-sm text-muted" aria-live="polite">{answered} of {VIBE_QUESTIONS.length} answered</p>
      {VIBE_QUESTIONS.map((question) => (
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
