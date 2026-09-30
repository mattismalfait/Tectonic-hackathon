import { describe, expect, it } from 'vitest'
import { DATASETS } from '../data'
import { scoreProcess } from './index'

const TODAY = new Date('2026-09-30')

describe('scoring engine', () => {
  for (const data of DATASETS) {
    it(`explains every step of ${data.process.name} against the master`, () => {
      const result = scoreProcess(data, undefined, TODAY)
      expect(result.mode).toBe('master')
      for (const s of result.steps) {
        const x = s.explanation!
        expect(x).toBeDefined()
        expect(Object.keys(x.categories)).toEqual(['docs', 'messages', 'sap', 'people'])
        console.log(`\n${s.step.id} [${s.band}] ${x.headline}`)
        for (const c of Object.values(x.categories)) console.log(`   ${c.label}: ${c.summary}`)
        for (const cc of x.crossChecks) console.log(`   ↔ ${cc.sentence}`)
        console.log(`   = ${x.calculation.formula}`)
      }
      console.log(`\nPROCESS ${Math.round(result.score * 100)}% ${result.status}; ${result.actions.length} actions`)
      expect(result.steps.length).toBe(data.process.steps.length)
    })

    it(`every claim quote appears verbatim in its source (${data.process.name})`, () => {
      for (const c of data.claims) {
        const src = data.sources.find((s) => s.id === c.source_id)
        expect(src, c.id).toBeDefined()
        expect(src!.text.includes(c.quote), c.id).toBe(true)
      }
    })

    it(`the master covers every step (${data.process.name})`, () => {
      for (const s of data.process.steps) expect(data.master!.steps.some((m) => m.step_id === s.id), s.id).toBe(true)
    })
  }

  it('a step where the heaviest sources confirm the master scores higher than one where they differ', () => {
    const r = scoreProcess(DATASETS[0], undefined, TODAY)
    const step2 = r.steps.find((s) => s.step.id === 'step-2')!
    const step4 = r.steps.find((s) => s.step.id === 'step-4')!
    expect(step2.score).toBeGreaterThan(step4.score)
  })

  it('without a master the engine falls back to consensus scoring', () => {
    const { master: _master, ...noMaster } = DATASETS[0]
    const r = scoreProcess(noMaster, undefined, TODAY)
    expect(r.mode).toBe('consensus')
    expect(r.steps.every((s) => s.explanation === undefined)).toBe(true)
  })
})
