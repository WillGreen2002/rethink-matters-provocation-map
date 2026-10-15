---
tags: [discussion, aired, scale/micro, wg/wg1]
---
# Biosensors for continuous evolution: what blocks them?

*RM010 (2026-09-12)* · notes RM010.1

## Provocation

> We can now make a million enzyme variants in a library (either by design or random mutation) and build them, but for most biosynthetic targets the only readout is HPLC or MS at a few hundred samples a day, so we screen a millionth of the constructued fitness landscape. Additionally, the biosynthetic pathways that are unsolved or are uneconomical to scale tend to rely on low-throughput iteration like non-chromophoric monomers, aggregation-prone and membrane-bound enzymes, anything without a growth phenotype. Allosteric transcription factors solve this in principle by converting concentration into fluorescence via biological detection, unlocking FACS and continuous evolution under signal-dependent pressures, but weare relyant on just handful of natural sensors (LacI, TetR, AraC, BenM) whose ligand space is an accident of what E. coli happened to be exposed to. The ligand/chemical space currently accessible by biosensors dwarfs natural biomolecules, let alone synthetic ones. De novo design can now give us a protein that binds an arbitrary small molecule. The missing piece is allostery: turning that binding event into a transcriptional signal on demand. What are the blockages to biosensor design, and what circuit architectures are the best to implement a biosensor for improved product titre using continuous evolution?

## Post-meeting synthesis (anonymised digest)

- **Problem:** many metabolites (for example oxo acids) cannot be detected at high throughput; the usual workaround (HPLC or mass spectrometry) is slow and low-throughput.
- **Proposed solution:** engineer transcription factors that bind the target metabolite and drive a fluorescent reporter, enabling high-throughput screening (FACS or plate-based sorting) paired with continuous or adaptive laboratory evolution to select high producers.
- **Key challenges:** evolutionary escape (strains that give signal without making product); ubiquitous cellular metabolites (pyruvate, for example) that are hard to evolve away from; quantitative (not just presence/absence) detection.
- **Existing approaches mentioned:** the Marionette strain (positive and negative selection using non-canonical amino acids to evolve transcription-factor specificity); single-cell Raman sorting as a transcription-factor-free alternative (needs a calibration curve and costly equipment); retron-guided continuous evolution as a way to generate libraries.
- **Opportunity:** biosensor design plus recursive strain improvement is highly automatable: a possible autonomous-lab service.

## Feeds topics

- [[Variant-library screening]]
- [[Biosensor design]]
