# Example: bank account change

Focus on one role, one workflow, one knowledge source, one trust signal.

## One role

**Payroll officer** at SD Worx.

They process a client request: pay this employee on a new bank account.

The person who *uses* the proof of concept in the demo is still this officer (the moment of doubt). A knowledge owner can sit beside them later to accept an update. Do not build a separate admin product in this example.

## One workflow

**Change the IBAN used to pay an employee.**

Trigger: client HR (or the employee) asks to pay salary to a new account.

Official steps, in order:

1. Identify the employee (name + employee number).
2. Enter the new IBAN.
3. Set the first pay date that should use this account.
4. Submit.

That is the whole workflow. No offboarding, no country packs, no payroll engine.

## One knowledge source

**The official bank-account change form** (the procedure as published).

Fields the knowledge source says are enough:

| Field                 | Required |
| --------------------- | -------- |
| Employee name         | yes      |
| Employee number       | yes      |
| New IBAN              | yes      |
| First pay date        | yes      |
| Submit                | yes      |

This form *is* the central knowledge source. Matching later means: compare how people actually complete the job against these fields and these steps.

## One trust signal

**“Can I submit this change as the official form describes, or is the procedure incomplete?”**

Show it as a single, visible state on the job — not a model score.

| Signal        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| **Ready**     | This job used only the official fields. The published form covers it.   |
| **Incomplete procedure** | Seniors repeatedly add a step the form does not have (fraud check, cutoff, proof). Do not treat the official form as sufficient. |

The signal is binary and explainable. Example copy:

> Incomplete procedure — 3 senior officers confirmed the new IBAN by phone before submitting. The official form does not include this step.

Trust rises only if someone updates the knowledge source (the form) to include that step. Until then, the officer should not rely on the published procedure alone.

## What seniors actually do (observation)

Same official fields, plus extras the form does not ask:

- Confirm the IBAN via a second channel (phone / manager) — fraud.
- If payroll already ran this month, defer to the next cycle — cutoff.
- Sometimes attach a bank statement — client habit.

The forms tool logs each submission: official fields, extras, skipped fields, who submitted (senior vs junior).

Only **repeated senior extras** feed the trust signal. A junior skipping the employee number is an error, not a reason to change the procedure.

## Seed jobs (so the gap is obvious)

1. Marie (senior): all official fields + phone confirmation.
2. Marie (senior): all official fields + phone confirmation + “after cutoff, next cycle”.
3. Marie (senior): all official fields + phone confirmation + proof attached.
4. Sam (junior): IBAN only, no employee number, no confirmation.

Jobs 1–3 should flip the trust signal to **Incomplete procedure**. Job 4 should not.

## Demo line

“I found the official form. I understand it does not match how seniors change an IBAN. I should not rely on it until the procedure includes the fraud check.”
