# Open Questions

These are the genuinely hard things this framework does not yet solve cleanly. They are noted here so a building team starts thinking about them on day one, not day 700.

---

**1. Cross-app capability composition.** When a user wants "Gmail + Calendar + Linear in one lens," who hosts the compiler and who owns the manifest? Likely a neutral "interface agent" provider, but the trust model is non-trivial.

**2. Capability versioning at scale.** When 100 apps each version their capabilities monthly, the cross-product matrix of cache keys explodes. Smart bucketing required.

**3. Compiler determinism.** Same inputs should produce the same manifest. LLMs are stochastic. Strategies: temperature 0, fingerprinted prompts, output post-processing into canonical form, or full intermediate-representation pipelines.

**4. The marketplace governance problem.** When users share recipes, how do you prevent malicious or low-quality recipes from spreading? Rating, signing, audit history all help; none are complete.

**5. The "interface monoculture" risk.** If most users adopt a few popular lenses, you lose the diversity benefit and might as well have shipped them as features. Need to actively encourage divergence.

**6. Latency for first-time compilations.** 1-3 seconds is OK for "switch lens." Not OK for "open app for the first time." Pre-warming and good defaults are the answer, but require careful product design.

**7. Compiler upgrades that change behavior.** A new compiler model might produce subtly different manifests for the same inputs. Migration strategy: hold old manifests, A/B new compiler, eval-gate the rollout, allow user opt-in/out.

---

These are all tractable. They surface on day one in any serious build, so plan for them early.
