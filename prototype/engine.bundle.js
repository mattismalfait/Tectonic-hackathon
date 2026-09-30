var SDEngine = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/engine/actions.ts
	var ownerOf = (e) => e.source.owner_status === "active" ? e.source.author_role : "Knowledge manager";
	function deriveActions(steps, mode) {
		const actions = [];
		const seen = /* @__PURE__ */ new Set();
		const push = (a) => {
			const key = `${a.kind}:${a.text}`;
			if (!seen.has(key)) {
				seen.add(key);
				actions.push(a);
			}
		};
		for (const r of steps) {
			const owner = r.step.step_owner_role;
			const masterValue = r.explanation?.master.value;
			if (r.band === "gap") {
				push({
					kind: "capture",
					stepId: r.step.id,
					text: mode === "master" ? `Nothing reflects the master for "${r.step.name}": add it to the procedure and brief the team (StarGaze capture).` : `Capture knowledge for "${r.step.name}" (no source exists). Run a StarGaze capture session.`,
					who: owner
				});
				continue;
			}
			if (mode === "consensus") {
				if (r.contested && r.groups.length > 1) push({
					kind: "decide",
					stepId: r.step.id,
					text: `Decide "${r.step.name}": "${r.groups[0].value}" vs "${r.groups[1].value}".`,
					who: owner
				});
				if (r.undocumented) push({
					kind: "document",
					stepId: r.step.id,
					text: `Document "${r.step.name}": today it only lives in chats and people's heads.`,
					who: owner
				});
			}
			if (mode === "master" && r.explanation?.calculation.cap) push({
				kind: "document",
				stepId: r.step.id,
				text: `Only low-weight sources confirm "${r.step.name}": put it in the approved procedure.`,
				who: owner
			});
			const differingMessages = r.evidence.filter((e) => e.status === "contradicts" && (e.source.type === "chat" || e.source.type === "email"));
			if (mode === "master" && differingMessages.length) push({
				kind: "align",
				stepId: r.step.id,
				text: `Post a correction for "${r.step.name}": ${differingMessages.length} message(s) still say "${differingMessages[0].claim.value}" (master: "${masterValue}").`,
				who: "Knowledge manager"
			});
			for (const e of r.evidence) {
				if ((e.status === "overruled" || e.status === "contradicts" && !r.contested) && (e.source.type === "doc" || e.source.type === "business_app")) push({
					kind: "retire",
					stepId: r.step.id,
					text: masterValue ? `Update "${e.source.title}" to the master: it says "${e.claim.value}", master says "${masterValue}".` : `Update or retire "${e.source.title}": it says "${e.claim.value}".`,
					who: ownerOf(e)
				});
				if (mode === "master" && e.status === "contradicts" && e.source.type === "person") push({
					kind: "align",
					stepId: r.step.id,
					text: `Brief ${e.source.author_role} on "${r.step.name}": works with "${e.claim.value}", master says "${masterValue}".`,
					who: owner
				});
				if (e.status === "supports" && e.source.owner_status === "left") push({
					kind: "reassign",
					stepId: r.step.id,
					text: `Assign a new owner to "${e.source.title}" (owner left).`,
					who: "Knowledge manager"
				});
				if (e.status === "supports" && e.source.type === "doc" && e.signals.reviewed === 0) push({
					kind: "review",
					stepId: r.step.id,
					text: `Review "${e.source.title}" (not reviewed in 12 months).`,
					who: ownerOf(e)
				});
			}
		}
		return actions;
	}
	//#endregion
	//#region src/engine/signals.ts
	var DEFAULT_WEIGHTS = {
		designated: 1,
		approved: 1,
		recent: 1,
		reviewed: 1,
		ownerActive: 1
	};
	var SIGNAL_LABELS = {
		designated: "Designated source for this step",
		approved: "Formally approved",
		recent: "Recent (36-month decay)",
		reviewed: "Reviewed / verified in last 12 months",
		ownerActive: "Owner still active in role"
	};
	/** Sources younger than this are labelled "new" in explanations. */
	var RECENT_MONTHS = 24;
	function monthsBetween(from, to) {
		return (to.getTime() - new Date(from).getTime()) / 2630016e3;
	}
	/** Docs and systems of record are registered sources; a person only when RACI-responsible for the step. */
	function isDesignated(source, step) {
		if (source.type === "decision" || source.type === "doc" || source.type === "business_app") return true;
		if (source.type === "person") return source.author_role.trim().toLowerCase() === step.step_owner_role.trim().toLowerCase();
		return false;
	}
	function computeSignals(source, step, today) {
		const age = Math.max(0, monthsBetween(source.date, today));
		const reviewDate = source.last_reviewed ?? (source.type === "doc" || source.type === "business_app" || source.type === "decision" ? source.date : null);
		return {
			designated: isDesignated(source, step) ? 1 : 0,
			approved: source.approval_status === "approved" ? 1 : 0,
			recent: Math.max(0, 1 - age / 36),
			reviewed: reviewDate !== null && monthsBetween(reviewDate, today) <= 12 ? 1 : 0,
			ownerActive: source.owner_status === "active" ? 1 : source.owner_status === "moved" ? .5 : 0
		};
	}
	/** Source weight = weighted average of the five signals (0..1). */
	function weightOf(signals, weights) {
		const keys = Object.keys(weights);
		const total = keys.reduce((s, k) => s + weights[k], 0);
		return total === 0 ? 0 : keys.reduce((s, k) => s + weights[k] * signals[k], 0) / total;
	}
	//#endregion
	//#region src/engine/evidence.ts
	function collectEvidence(step, data, weights, today, resolution) {
		const sourceById = new Map(data.sources.map((s) => [s.id, s]));
		const reasons = [];
		const evidence = data.claims.filter((c) => c.step_id === step.id && sourceById.has(c.source_id)).map((claim) => {
			const source = sourceById.get(claim.source_id);
			const signals = computeSignals(source, step, today);
			return {
				claim,
				source,
				signals,
				weight: weightOf(signals, weights),
				status: "supports"
			};
		});
		for (const e of evidence) if (e.source.country !== data.process.client.country) {
			e.status = "excluded";
			e.excludedReason = `different country (${e.source.country}), process is ${data.process.client.country}`;
			reasons.push(`Excluded "${e.source.title}": ${e.excludedReason}.`);
		}
		for (const e of evidence) {
			if (e.status === "excluded" || !e.source.origin) continue;
			const original = sourceById.get(e.source.origin);
			if (original) e.echoOf = original.title;
		}
		if (resolution) {
			const source = {
				id: `decision-${step.id}`,
				title: `QM decision (${resolution.decidedBy})`,
				type: "decision",
				system: "TruthMap",
				author_role: resolution.decidedBy,
				owner_status: "active",
				approval_status: "approved",
				date: resolution.date,
				country: data.process.client.country,
				client_specific: true,
				origin: null,
				text: resolution.rationale
			};
			const claim = {
				id: `decision-claim-${step.id}`,
				step_id: step.id,
				source_id: source.id,
				value: resolution.value,
				statement: resolution.rationale,
				quote: resolution.rationale
			};
			const signals = computeSignals(source, step, today);
			evidence.push({
				claim,
				source,
				signals,
				weight: weightOf(signals, weights),
				status: "supports"
			});
			reasons.push(`Resolved by ${resolution.decidedBy} on ${resolution.date}: "${resolution.rationale}".`);
		}
		return {
			evidence,
			reasons
		};
	}
	//#endregion
	//#region src/engine/util.ts
	var THRESHOLDS = {
		green: .75,
		amber: .5
	};
	var pct = (x) => `${Math.round(x * 100)}%`;
	/** Band on the displayed (rounded) percentage, so "75%" is never shown as amber. */
	function bandOf(score, hasEvidence) {
		if (!hasEvidence) return "gap";
		const shown = Math.round(score * 100);
		if (shown >= THRESHOLDS.green * 100) return "green";
		if (shown >= THRESHOLDS.amber * 100) return "amber";
		return "red";
	}
	//#endregion
	//#region src/engine/consensus.ts
	var CONTESTED_RATIO = .5;
	var CONTESTED_CAP = .45;
	var UNDOCUMENTED_CAP$1 = .7;
	var CONFIRMATION_BONUS = .1;
	var ECHO_BONUS = .05;
	function scoreStepConsensus(step, data, weights, today, resolution) {
		const { evidence, reasons } = collectEvidence(step, data, weights, today, resolution);
		if (resolution) {
			for (const e of evidence) if (e.status !== "excluded" && e.claim.value !== resolution.value) {
				e.status = "overruled";
				e.excludedReason = `Overruled by QM decision on ${resolution.date}`;
			}
		}
		const counted = evidence.filter((e) => e.status === "supports");
		if (counted.length === 0) {
			reasons.push("No source describes this step: knowledge gap.");
			return {
				step,
				score: 0,
				band: "gap",
				groups: [],
				evidence,
				agreement: 0,
				strength: 0,
				reasons,
				contested: false,
				undocumented: true,
				resolution
			};
		}
		const groupMap = /* @__PURE__ */ new Map();
		for (const e of counted) {
			const g = groupMap.get(e.claim.value) ?? {
				value: e.claim.value,
				weight: 0,
				evidence: []
			};
			g.weight += e.weight;
			g.evidence.push(e);
			groupMap.set(e.claim.value, g);
		}
		const groups = [...groupMap.values()].sort((a, b) => b.weight - a.weight);
		const leading = groups[0];
		const totalWeight = groups.reduce((s, g) => s + g.weight, 0);
		for (const e of counted) e.status = e.claim.value === leading.value ? "supports" : "contradicts";
		const agreement = totalWeight > 0 ? leading.weight / totalWeight : 0;
		const support = [...leading.evidence].sort((a, b) => b.weight - a.weight);
		const others = support.slice(1);
		const independent = others.filter((e) => !e.echoOf).length;
		const echoes = others.length - independent;
		const strength = Math.min(1, support[0].weight + CONFIRMATION_BONUS * independent + ECHO_BONUS * echoes);
		reasons.push(`Agreement ${pct(agreement)}: "${leading.value}" carries ${leading.weight.toFixed(2)} of ${totalWeight.toFixed(2)} total evidence weight.`);
		reasons.push(`Strength ${pct(strength)}: strongest supporting source weighs ${support[0].weight.toFixed(2)}` + (independent > 0 ? ` + ${independent} independent confirmation(s) × ${CONFIRMATION_BONUS}` : "") + (echoes > 0 ? ` + ${echoes} repeat(s) × ${ECHO_BONUS}` : "") + ".");
		let score = agreement * strength;
		const runnerUp = groups[1];
		const contested = !!runnerUp && runnerUp.weight >= CONTESTED_RATIO * leading.weight;
		if (contested) {
			reasons.push(`Contested: "${runnerUp.value}" weighs ${runnerUp.weight.toFixed(2)} (≥ ${pct(CONTESTED_RATIO)} of the leading value). The model does not choose, a human decides. Capped at ${pct(CONTESTED_CAP)}.`);
			score = Math.min(score, CONTESTED_CAP);
		} else if (runnerUp) reasons.push(`Minor contradiction: "${runnerUp.value}" weighs only ${runnerUp.weight.toFixed(2)}, the leading value holds.`);
		const undocumented = !leading.evidence.some((e) => e.source.type === "doc" && e.source.approval_status === "approved" || e.source.type === "business_app" || e.source.type === "decision");
		if (undocumented) {
			reasons.push(`Undocumented practice: no approved document or system of record supports this value. Capped at ${pct(UNDOCUMENTED_CAP$1)}.`);
			score = Math.min(score, UNDOCUMENTED_CAP$1);
		}
		return {
			step,
			score,
			band: bandOf(score, true),
			leading,
			groups,
			evidence,
			agreement,
			strength,
			reasons,
			contested,
			undocumented,
			resolution
		};
	}
	//#endregion
	//#region src/engine/master.ts
	/** A repeat of another source counts, but with half its weight. */
	var ECHO_FACTOR = .5;
	var THIN_EVIDENCE_CAP = .7;
	var CATEGORY_LABELS = {
		docs: "Docs",
		messages: "Messages",
		sap: "SAP",
		people: "People"
	};
	var CATEGORY_ORDER = [
		"docs",
		"messages",
		"sap",
		"people"
	];
	var NOUN = {
		docs: "docs",
		messages: "messages",
		sap: "SAP",
		people: "people"
	};
	var VERB = {
		docs: "say",
		messages: "say",
		sap: "says",
		people: "say"
	};
	var SILENT = {
		docs: "no doc mentions this step",
		messages: "no message mentions this step",
		sap: "SAP does not cover this step",
		people: "nobody mentions this step"
	};
	/** A step that no doc and no system of record mentions lives only in chats and heads. */
	var UNDOCUMENTED_CAP = .7;
	function categoryOf(type) {
		if (type === "doc") return "docs";
		if (type === "chat" || type === "email") return "messages";
		if (type === "business_app") return "sap";
		if (type === "person") return "people";
		return null;
	}
	var norm$1 = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
	var effective = (e) => e.echoOf ? e.weight * ECHO_FACTOR : e.weight;
	function joinAnd(parts) {
		if (parts.length <= 1) return parts.join("");
		return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
	}
	function count(n, one, many) {
		return `${n} ${n === 1 ? one : many}`;
	}
	function describe(c) {
		switch (c.type) {
			case "doc": return `the ${c.age} doc "${c.title}" (${c.date})`;
			case "business_app": return `SAP "${c.title}" (${c.date})`;
			case "person": return `${c.authorRole} (StarGaze, ${c.date})`;
			case "chat":
			case "email": return `${c.age === "old" ? "an old" : "a new"} ${c.system} message by ${c.authorRole} (${c.date})`;
			default: return `"${c.title}" (${c.date})`;
		}
	}
	function toComparison(e, masterValue, today) {
		const ageMonths = Math.max(0, monthsBetween(e.source.date, today));
		return {
			sourceId: e.source.id,
			title: e.source.title,
			type: e.source.type,
			system: e.source.system,
			authorRole: e.source.author_role,
			date: e.source.date,
			ageMonths: Math.round(ageMonths),
			age: ageMonths <= 24 ? "new" : "old",
			weight: effective(e),
			signals: e.signals,
			verdict: e.status === "excluded" || e.status === "overruled" ? "excluded" : e.status === "supports" ? "confirms" : "differs",
			says: e.claim.value,
			statement: e.claim.statement,
			quote: e.claim.quote,
			masterSays: masterValue,
			note: e.excludedReason ?? (e.echoOf ? `repeats "${e.echoOf}" (counts for half)` : void 0)
		};
	}
	function categoryView(category, comps, masterValue) {
		const counted = comps.filter((c) => c.verdict !== "excluded");
		const confirming = counted.filter((c) => c.verdict === "confirms");
		const differing = counted.filter((c) => c.verdict === "differs");
		const label = CATEGORY_LABELS[category];
		const status = counted.length === 0 ? "silent" : differing.length === 0 ? "confirms" : confirming.length === 0 ? "differs" : "mixed";
		let summary;
		if (status === "silent") summary = `Silent: ${SILENT[category]}` + (comps.length ? ` (${comps.length} excluded).` : ".");
		else {
			const fragments = counted.map((c) => c.verdict === "confirms" ? `${describe(c)} confirms` : `${describe(c)} says "${c.says}"`);
			summary = `${status === "confirms" ? "Confirms" : status === "differs" ? "Differs" : "Mixed"}: ${fragments.join("; ")}.` + (differing.length ? ` Master: "${masterValue}".` : "");
		}
		return {
			category,
			label,
			status,
			sources: comps,
			weightConfirming: confirming.reduce((s, c) => s + c.weight, 0),
			weightDiffering: differing.reduce((s, c) => s + c.weight, 0),
			summary
		};
	}
	/** The value a category currently stands for, based on its NEW sources only (weighted majority). */
	function recentPosition(view) {
		const recent = view.sources.filter((c) => c.verdict !== "excluded" && c.age === "new");
		if (recent.length === 0) return null;
		const byValue = /* @__PURE__ */ new Map();
		for (const c of recent) byValue.set(c.says, (byValue.get(c.says) ?? 0) + c.weight);
		return [...byValue.entries()].sort((a, b) => b[1] - a[1])[0][0];
	}
	function crossChecks(categories, masterValue) {
		const out = [];
		for (let i = 0; i < CATEGORY_ORDER.length; i++) for (let j = i + 1; j < CATEGORY_ORDER.length; j++) {
			const a = CATEGORY_ORDER[i];
			const b = CATEGORY_ORDER[j];
			const pa = recentPosition(categories[a]);
			const pb = recentPosition(categories[b]);
			if (pa === null || pb === null) continue;
			const la = `recent ${NOUN[a]}`;
			const lb = `recent ${NOUN[b]}`;
			const match = norm$1(pa) === norm$1(pb);
			const sentence = match ? `${cap(la)} and ${lb} match` + (norm$1(pa) === norm$1(masterValue) ? " (both follow the master)." : `, but both differ from the master ("${pa}").`) : `${cap(la)} and ${lb} don't match: ${NOUN[a]} ${VERB[a]} "${pa}", ${NOUN[b]} ${VERB[b]} "${pb}".`;
			out.push({
				a,
				b,
				match,
				sentence
			});
		}
		return out;
	}
	var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
	var singular = (parts) => parts.length === 1 && (!/^\d/.test(parts[0]) || parts[0].startsWith("1 "));
	function headline(score, categories, capReason) {
		const differ = [];
		const confirm = [];
		const docs = categories.docs.sources.filter((c) => c.verdict !== "excluded");
		for (const verdict of ["differs", "confirms"]) {
			const target = verdict === "differs" ? differ : confirm;
			for (const age of ["new", "old"]) {
				const n = docs.filter((c) => c.verdict === verdict && c.age === age).length;
				if (n) target.push(n === 1 ? `the ${age} doc` : `${n} ${age} docs`);
			}
			const msgs = categories.messages.sources.filter((c) => c.verdict === verdict).length;
			if (msgs) target.push(count(msgs, "message", "messages"));
			if (categories.sap.sources.filter((c) => c.verdict === verdict).length) target.push("SAP");
			const ppl = categories.people.sources.filter((c) => c.verdict === verdict).length;
			if (ppl) target.push(count(ppl, "person", "people"));
		}
		let text;
		if (differ.length === 0) text = `${pct(score)}: every source that mentions this step confirms the master (${joinAnd(confirm)}).`;
		else if (confirm.length === 0) text = `${pct(score)}: no source confirms the master; ${joinAnd(differ)} ${singular(differ) ? "differs" : "differ"} from it.`;
		else text = `${pct(score)}: ${joinAnd(differ)} ${singular(differ) ? "differs" : "differ"} from the master; ${joinAnd(confirm)} ${singular(confirm) ? "confirms" : "confirm"} it.`;
		return capReason ? `${text} ${capReason}` : text;
	}
	function scoreStepMaster(step, data, master, weights, today, resolution) {
		const gold = master.steps.find((s) => s.step_id === step.id) ?? {
			step_id: step.id,
			value: "(not in master)",
			statement: ""
		};
		const m = resolution ? {
			step_id: step.id,
			value: resolution.value,
			statement: resolution.rationale
		} : gold;
		const confirmsGold = norm$1(m.value) === norm$1(gold.value);
		const { evidence, reasons: collectReasons } = collectEvidence(step, data, weights, today, resolution);
		for (const e of evidence) {
			if (e.status === "excluded") continue;
			const matches = e.source.type === "decision" || (confirmsGold && e.claim.matches_master !== void 0 ? e.claim.matches_master : norm$1(e.claim.value) === norm$1(m.value));
			e.status = matches ? "supports" : "contradicts";
			if (resolution && !matches) {
				e.status = "overruled";
				e.excludedReason = `overruled by the decision of ${resolution.decidedBy} on ${resolution.date}`;
			}
		}
		const counted = evidence.filter((e) => e.status !== "excluded" && e.status !== "overruled");
		const comps = evidence.filter((e) => categoryOf(e.source.type) !== null).map((e) => toComparison(e, m.value, today));
		const categories = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, categoryView(c, comps.filter((x) => categoryOf(x.type) === c), m.value)]));
		const wC = counted.filter((e) => e.status === "supports").reduce((s, e) => s + effective(e), 0);
		const wD = counted.filter((e) => e.status === "contradicts").reduce((s, e) => s + effective(e), 0);
		const wT = wC + wD;
		const conformance = wT > 0 ? wC / wT : 0;
		const strongestConfirming = Math.max(0, ...counted.filter((e) => e.status === "supports").map((e) => e.weight));
		let score = conformance;
		let capInfo;
		if (counted.length > 0 && wC > 0 && strongestConfirming < .5) {
			capInfo = {
				value: THIN_EVIDENCE_CAP,
				reason: `Capped at ${pct(THIN_EVIDENCE_CAP)}: only low-weight sources confirm the master (strongest weighs ${strongestConfirming.toFixed(2)}).`
			};
			score = Math.min(score, THIN_EVIDENCE_CAP);
		}
		const documented = counted.some((e) => e.source.type === "doc" || e.source.type === "business_app" || e.source.type === "decision");
		if (counted.length > 0 && !documented && score > .7) {
			capInfo = {
				value: UNDOCUMENTED_CAP,
				reason: `Capped at ${pct(UNDOCUMENTED_CAP)}: no doc or SAP covers this step, it only lives in messages and people.`
			};
			score = UNDOCUMENTED_CAP;
		}
		const docs = {
			new: categories.docs.sources.filter((c) => c.verdict !== "excluded" && c.age === "new"),
			old: categories.docs.sources.filter((c) => c.verdict !== "excluded" && c.age === "old")
		};
		const hasEvidence = counted.length > 0;
		const explanation = {
			master: {
				value: m.value,
				statement: m.statement
			},
			headline: hasEvidence ? headline(score, categories, capInfo?.reason) : "No source mentions this step: the master step is not reflected in any doc, system, message or person.",
			categories,
			docs,
			crossChecks: crossChecks(categories, m.value),
			calculation: {
				weightConfirming: wC,
				weightDiffering: wD,
				weightTotal: wT,
				conformance,
				cap: capInfo,
				formula: `conformance = confirming weight ${wC.toFixed(2)} / total weight ${wT.toFixed(2)} = ${pct(conformance)}` + (capInfo ? ` → capped at ${pct(capInfo.value)}` : "")
			}
		};
		const groupMap = /* @__PURE__ */ new Map();
		groupMap.set(norm$1(m.value), {
			value: m.value,
			weight: 0,
			evidence: []
		});
		for (const e of counted) {
			const key = e.status === "supports" ? norm$1(m.value) : norm$1(e.claim.value);
			const g = groupMap.get(key) ?? {
				value: e.claim.value,
				weight: 0,
				evidence: []
			};
			g.weight += effective(e);
			g.evidence.push(e);
			groupMap.set(key, g);
		}
		const [masterGroup, ...rest] = [...groupMap.values()];
		const groups = [masterGroup, ...rest.sort((a, b) => b.weight - a.weight)];
		const officialDiffers = counted.some((e) => e.status === "contradicts" && (e.source.type === "doc" || e.source.type === "business_app") && monthsBetween(e.source.date, today) < 24);
		const contested = !resolution && counted.length > 0 && rest.length > 0 && (bandOf(score, true) === "red" || officialDiffers);
		const reasons = [
			explanation.headline,
			...CATEGORY_ORDER.map((c) => `${categories[c].label}: ${categories[c].summary}`),
			...explanation.crossChecks.map((x) => x.sentence),
			`How: ${explanation.calculation.formula}.`,
			...collectReasons
		];
		return {
			step,
			score: hasEvidence ? score : 0,
			band: bandOf(score, hasEvidence),
			leading: masterGroup,
			groups: hasEvidence ? groups : [],
			evidence,
			agreement: conformance,
			strength: conformance > 0 ? score / conformance : 0,
			reasons,
			contested,
			undocumented: !documented,
			resolution,
			explanation
		};
	}
	//#endregion
	//#region src/engine/sop.ts
	/** Raw file name -> source id in sources.json, per process. Files not listed get a source from their path. */
	var SOURCE_FILES = { "proc-bank-account-change": {
		"LUM-PAY-007_v2.0_2026_bank-account-change.docx": "src-01",
		"LUM-PAY-007_v1.2_2022_bank-account-change.docx": "src-02",
		"lumina-intranet-hr-faq-bank-account.md": "src-03",
		"sap_PAYINFO_CHG_LUM.txt": "src-04",
		"sap_ZPAYLOCK_BE.txt": "src-05",
		"2026-08-21_lumina-hr_monthly-iban-list.txt": "src-17",
		"stargaze_payroll-consultant_screen-recording_2026-09-10.txt": "src-18",
		"stargaze_former-lumina-consultant_interview_2026-09-12.txt": "src-19",
		"stargaze_lumina-hr-manager_interview_2026-08-28.txt": "src-20"
	} };
	var baseName = (path) => path.split(/[\\/]/).pop() ?? path;
	/** Source type from the raw folder or extension. Recorder output (.jsonl) and anything unknown is a person capture. */
	function typeFromPath(path) {
		const p = path.replace(/\\/g, "/").toLowerCase();
		if (p.includes("/docs/") || /\.(docx?|pdf|md)$/.test(p)) return "doc";
		if (p.includes("/apps/")) return "business_app";
		if (p.includes("/chat/")) return "chat";
		if (p.includes("/email/")) return "email";
		return "person";
	}
	var SYSTEM_OF = {
		doc: "Document",
		business_app: "SAP SuccessFactors",
		chat: "Slack",
		email: "Outlook",
		person: "Recorder",
		decision: "Quality manager"
	};
	/** A source for a raw file with no entry in sources.json: dated from the file name (else today), unreviewed. */
	function sourceFromPath(path, country, today = /* @__PURE__ */ new Date()) {
		const name = baseName(path);
		const type = typeFromPath(path);
		const date = name.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? today.toISOString().slice(0, 10);
		return {
			id: `file:${name}`,
			title: name,
			type,
			system: SYSTEM_OF[type],
			author_role: "Unknown",
			owner_status: "active",
			approval_status: "unreviewed",
			date,
			last_reviewed: null,
			country,
			client_specific: true,
			origin: null,
			text: ""
		};
	}
	/** Word-overlap similarity (Jaccard on words of 3+ letters), 0..1. */
	function similarity(a, b) {
		const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9à-ÿ]{3,}/g) ?? []);
		const wa = words(a);
		const wb = words(b);
		if (wa.size === 0 || wb.size === 0) return 0;
		let shared = 0;
		for (const w of wa) if (wb.has(w)) shared++;
		return shared / (wa.size + wb.size - shared);
	}
	var norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
	function masterFromSop(master, ownerRole = "Quality manager", version = "1.0", date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
		return {
			process_id: master.id,
			title: master.name,
			owner_role: ownerRole,
			version,
			date,
			steps: master.steps.map((s) => ({
				step_id: s.id,
				value: s.description,
				statement: s.description
			}))
		};
	}
	function processFromSop(master, client) {
		return {
			id: master.id,
			name: master.name,
			client,
			steps: master.steps.map((s, i) => ({
				id: s.id,
				order: i + 1,
				name: s.name,
				description: s.description,
				criticality: 2,
				step_owner_role: "Process owner"
			}))
		};
	}
	/**
	* Build a scoring dataset from the master SOP and the SOPs per source.
	* `sources` holds the metadata (type, date, owner, approval, …) that the five signals need.
	*/
	function sopsToDataset(process, master, sops, sources) {
		const masterSop = masterFromSop(master);
		const byId = new Map(master.steps.map((s) => [s.id, s]));
		const byName = new Map(master.steps.map((s) => [norm(s.name), s]));
		const all = [...sources];
		const known = new Set(sources.map((s) => s.id));
		const files = SOURCE_FILES[process.id] ?? {};
		const claims = [];
		for (const sop of sops) {
			let sourceId = sop.source_id ?? (sop.source ? files[baseName(sop.source)] : void 0);
			if (!sourceId && sop.source) {
				const extra = sourceFromPath(sop.source, process.client.country);
				if (!known.has(extra.id)) {
					all.push(extra);
					known.add(extra.id);
				}
				sourceId = extra.id;
			}
			if (!sourceId || !known.has(sourceId)) continue;
			sop.steps.forEach((step, i) => {
				const m = byId.get(step.id) ?? byName.get(norm(step.name));
				if (!m) return;
				claims.push({
					id: `${sourceId}-${m.id}-${i}`,
					step_id: m.id,
					source_id: sourceId,
					value: step.says ?? step.description,
					statement: step.says ?? step.description,
					quote: step.quote ?? step.description,
					matches_master: step.matches_master ?? step.match ?? similarity(step.description, m.description) >= .5
				});
			});
		}
		return {
			process,
			master: masterSop,
			sources: all,
			claims
		};
	}
	/**
	* A dataset with the matcher's results folded in: for every source the matcher checked, its
	* results replace that source's hand-made claims. The master (gold values) is kept as it is.
	*/
	function withMatcherResults(data, sops) {
		if (sops.length === 0) return data;
		const asSop = {
			id: data.process.id,
			name: data.process.name,
			steps: data.process.steps
		};
		const matched = sopsToDataset(data.process, asSop, sops, data.sources);
		const checked = new Set(matched.claims.map((c) => c.source_id));
		return {
			...data,
			sources: matched.sources,
			claims: [...data.claims.filter((c) => !checked.has(c.source_id)), ...matched.claims]
		};
	}
	//#endregion
	//#region src/engine/index.ts
	function scoreProcess(data, weights = DEFAULT_WEIGHTS, today = /* @__PURE__ */ new Date(), resolutions = {}) {
		const mode = data.master ? "master" : "consensus";
		const steps = [...data.process.steps].sort((a, b) => a.order - b.order).map((s) => data.master ? scoreStepMaster(s, data, data.master, weights, today, resolutions[s.id]) : scoreStepConsensus(s, data, weights, today, resolutions[s.id]));
		const totalCrit = steps.reduce((s, r) => s + r.step.criticality, 0);
		const score = totalCrit > 0 ? steps.reduce((s, r) => s + r.score * r.step.criticality, 0) / totalCrit : 0;
		const criticalRed = steps.some((r) => r.step.criticality >= 3 && (r.band === "red" || r.band === "gap"));
		const anyNotGreen = steps.some((r) => r.band !== "green");
		return {
			mode,
			score,
			status: criticalRed ? "Not release-ready" : anyNotGreen ? "Needs attention" : "Trusted",
			steps,
			actions: deriveActions(steps, mode)
		};
	}
	//#endregion
	exports.CATEGORY_LABELS = CATEGORY_LABELS;
	exports.DEFAULT_WEIGHTS = DEFAULT_WEIGHTS;
	exports.RECENT_MONTHS = RECENT_MONTHS;
	exports.SIGNAL_LABELS = SIGNAL_LABELS;
	exports.SOURCE_FILES = SOURCE_FILES;
	exports.THRESHOLDS = THRESHOLDS;
	exports.bandOf = bandOf;
	exports.categoryOf = categoryOf;
	exports.computeSignals = computeSignals;
	exports.masterFromSop = masterFromSop;
	exports.pct = pct;
	exports.processFromSop = processFromSop;
	exports.scoreProcess = scoreProcess;
	exports.similarity = similarity;
	exports.sopsToDataset = sopsToDataset;
	exports.sourceFromPath = sourceFromPath;
	exports.weightOf = weightOf;
	exports.withMatcherResults = withMatcherResults;
	return exports;
})({});
