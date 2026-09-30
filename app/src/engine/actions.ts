// Layer 4: turn step results into concrete actions, routed to the role that can fix them.

import type { Action, ScoredEvidence, StepResult } from './types'

const ownerOf = (e: ScoredEvidence) => (e.source.owner_status === 'active' ? e.source.author_role : 'Knowledge manager')

export function deriveActions(steps: StepResult[], mode: 'master' | 'consensus'): Action[] {
  const actions: Action[] = []
  const seen = new Set<string>()
  const push = (a: Action) => {
    const key = `${a.kind}:${a.text}`
    if (!seen.has(key)) {
      seen.add(key)
      actions.push(a)
    }
  }

  for (const r of steps) {
    const owner = r.step.step_owner_role
    const masterValue = r.explanation?.master.value

    if (r.band === 'gap') {
      push({
        kind: 'capture',
        stepId: r.step.id,
        text: mode === 'master'
          ? `Nothing reflects the master for "${r.step.name}": add it to the procedure and brief the team (StarGaze capture).`
          : `Capture knowledge for "${r.step.name}" (no source exists). Run a StarGaze capture session.`,
        who: owner,
      })
      continue
    }

    if (mode === 'consensus') {
      if (r.contested && r.groups.length > 1)
        push({ kind: 'decide', stepId: r.step.id, text: `Decide "${r.step.name}": "${r.groups[0].value}" vs "${r.groups[1].value}".`, who: owner })
      if (r.undocumented)
        push({ kind: 'document', stepId: r.step.id, text: `Document "${r.step.name}": today it only lives in chats and people's heads.`, who: owner })
    }

    if (mode === 'master' && r.explanation?.calculation.cap)
      push({ kind: 'document', stepId: r.step.id, text: `Only low-weight sources confirm "${r.step.name}": put it in the approved procedure.`, who: owner })

    const differingMessages = r.evidence.filter((e) => e.status === 'contradicts' && (e.source.type === 'chat' || e.source.type === 'email'))
    if (mode === 'master' && differingMessages.length)
      push({
        kind: 'align',
        stepId: r.step.id,
        text: `Post a correction for "${r.step.name}": ${differingMessages.length} message(s) still say "${differingMessages[0].claim.value}" (master: "${masterValue}").`,
        who: 'Knowledge manager',
      })

    for (const e of r.evidence) {
      const losing = e.status === 'overruled' || (e.status === 'contradicts' && !r.contested)
      if (losing && (e.source.type === 'doc' || e.source.type === 'business_app'))
        push({
          kind: 'retire',
          stepId: r.step.id,
          text: masterValue
            ? `Update "${e.source.title}" to the master: it says "${e.claim.value}", master says "${masterValue}".`
            : `Update or retire "${e.source.title}": it says "${e.claim.value}".`,
          who: ownerOf(e),
        })
      if (mode === 'master' && e.status === 'contradicts' && e.source.type === 'person')
        push({
          kind: 'align',
          stepId: r.step.id,
          text: `Brief ${e.source.author_role} on "${r.step.name}": works with "${e.claim.value}", master says "${masterValue}".`,
          who: owner,
        })
      if (e.status === 'supports' && e.source.owner_status === 'left')
        push({ kind: 'reassign', stepId: r.step.id, text: `Assign a new owner to "${e.source.title}" (owner left).`, who: 'Knowledge manager' })
      if (e.status === 'supports' && e.source.type === 'doc' && e.signals.reviewed === 0)
        push({ kind: 'review', stepId: r.step.id, text: `Review "${e.source.title}" (not reviewed in 12 months).`, who: ownerOf(e) })
    }
  }
  return actions
}
