export const DAILY_GOAL = 10

export type DailyGoalView = {
  emoji: string
  number: number
  phrase: string
  progress: number
  complete: boolean
}

const WHILE_OPEN = [
  { emoji: '🏆', phrase: 'One more for glory 🏆' },
  { emoji: '🍕', phrase: 'So close you can taste it 🍕' },
  { emoji: '🏁', phrase: 'Three to go, smell the victory 🏁' },
  { emoji: '🌶️', phrase: 'Four more and you’re on fire 🌶️' },
  { emoji: '⚡', phrase: 'Halfway there, legend in progress ⚡' },
  { emoji: '💪', phrase: 'Halfway-ish, don’t stop now 💪' },
  { emoji: '🐐', phrase: 'to get into goat mode 🐐' },
  { emoji: '🔥', phrase: 'to complete your streak 🔥' },
  { emoji: '🚀', phrase: 'First one down, keep rolling 🚀' },
  { emoji: '☕', phrase: 'Let’s warm up ☕' },
] as const

export function dailyGoal(openedToday: number): DailyGoalView {
  const opened = Math.max(0, Math.floor(openedToday))
  if (opened >= DAILY_GOAL) {
    return {
      emoji: '🐐',
      number: opened,
      phrase: 'Goat mode: ON 🐐',
      progress: 1,
      complete: true,
    }
  }
  const left = DAILY_GOAL - opened
  const copy = WHILE_OPEN[left - 1]
  return {
    emoji: copy.emoji,
    number: left,
    phrase: copy.phrase,
    progress: opened / DAILY_GOAL,
    complete: false,
  }
}

export function dailyGoalLine(openedToday: number): string {
  const view = dailyGoal(openedToday)
  const opened = Math.max(0, Math.floor(openedToday))
  const phrase = !view.complete && view.phrase.startsWith('to ') ? `${view.number} ${view.phrase}` : view.phrase
  return `${phrase} · ${opened}/${DAILY_GOAL} today`
}
