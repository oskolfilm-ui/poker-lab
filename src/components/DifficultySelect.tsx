import { LEVELS, isDifficulty, type Difficulty } from '../game/ai/levels'

export function DifficultySelect({ id, label, difficulty, disabled, onChange }: {
  id: string; label: string; difficulty: Difficulty; disabled: boolean; onChange: (value: Difficulty) => void
}) {
  return <select id={id} aria-label={label} value={difficulty} disabled={disabled} onChange={event => {
    if (isDifficulty(event.target.value)) onChange(event.target.value)
  }}>{LEVELS.map(level => <option key={level}>{level}</option>)}</select>
}
