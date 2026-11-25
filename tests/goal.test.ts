import { describe, expect, it } from 'vitest'

import { dailyGoal, dailyGoalLine } from '../lib/goal'

describe('daily goal', () => {
  it('counts down to 10 with a phrase for each step', () => {
    expect(dailyGoal(0)).toMatchObject({ emoji: '☕', number: 10, phrase: 'Let’s warm up ☕', progress: 0, complete: false })
    expect(dailyGoal(1)).toMatchObject({ emoji: '🚀', number: 9, phrase: 'First one down, keep rolling 🚀', progress: 0.1 })
    expect(dailyGoal(2).phrase).toBe('to complete your streak 🔥')
    expect(dailyGoal(3).phrase).toBe('to get into goat mode 🐐')
    expect(dailyGoal(4).phrase).toBe('Halfway-ish, don’t stop now 💪')
    expect(dailyGoal(5)).toMatchObject({ emoji: '⚡', number: 5, progress: 0.5 })
    expect(dailyGoal(6).phrase).toBe('Four more and you’re on fire 🌶️')
    expect(dailyGoal(7).phrase).toBe('Three to go, smell the victory 🏁')
    expect(dailyGoal(8).phrase).toBe('So close you can taste it 🍕')
    expect(dailyGoal(9)).toMatchObject({ emoji: '🏆', number: 1, phrase: 'One more for glory 🏆', progress: 0.9 })
  })

  it('locks the goat message once the goal is reached', () => {
    expect(dailyGoal(10)).toEqual({
      emoji: '🐐',
      number: 10,
      phrase: 'Goat mode: ON 🐐',
      progress: 1,
      complete: true,
    })
    expect(dailyGoal(14).number).toBe(14)
    expect(dailyGoal(14).phrase).toBe(dailyGoal(10).phrase)
    expect(dailyGoal(14).progress).toBe(1)
  })

  it('writes the same phrases as one context line with the score', () => {
    expect(dailyGoalLine(0)).toBe('Let’s warm up ☕ · 0/10 today')
    expect(dailyGoalLine(2)).toBe('8 to complete your streak 🔥 · 2/10 today')
    expect(dailyGoalLine(3)).toBe('7 to get into goat mode 🐐 · 3/10 today')
    expect(dailyGoalLine(10)).toBe('Goat mode: ON 🐐 · 10/10 today')
    expect(dailyGoalLine(12)).toBe('Goat mode: ON 🐐 · 12/10 today')
  })
})
