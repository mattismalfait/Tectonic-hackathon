import { describe, expect, it } from 'vitest'
import { DATASETS } from './data'
import { scoreProcess } from './engine'

const TODAY = new Date('2026-09-30')

describe('scoring engine', () => {
  for (const data of DATASETS) {
    it(`scores every step of ${data.process.name}`, () => {
      const result = scoreProcess(data, undefined, TODAY)
      for (const s of result.steps) {
        console.log(`${s.step.id} ${Math.round(s.score * 100)}% ${s.band} ${s.leading?.value ?? '-'}`)
      }
      console.log(`process ${Math.round(result.score * 100)}% ${result.status}; ${result.actions.length} actions`)
      expect(result.steps.length).toBe(data.process.steps.length)
    })

    it(`every claim quote appears verbatim in its source (${data.process.name})`, () => {
      for (const c of data.claims) {
        const src = data.sources.find((s) => s.id === c.source_id)
        expect(src, c.id).toBeDefined()
        expect(src!.text.includes(c.quote), c.id).toBe(true)
      }
    })
  }

  it('a human resolution overrules competing values', () => {
    const data = DATASETS[0]
    const step = data.process.steps.find((s) => s.criticality === 3)!
    const before = scoreProcess(data, undefined, TODAY).steps.find((s) => s.step.id === step.id)!
    const value = before.leading?.value ?? 'x'
    const after = scoreProcess(data, undefined, TODAY, {
      [step.id]: { stepId: step.id, value, rationale: 'Checked with legal', decidedBy: 'QM', date: '2026-09-30' },
    }).steps.find((s) => s.step.id === step.id)!
    expect(after.score).toBeGreaterThanOrEqual(before.score)
    expect(after.contested).toBe(false)
  })
})
