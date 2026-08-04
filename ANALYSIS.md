# Analysis: REDD+ Baseline & Additionality — Acre, Brazil

This document walks through the full analysis step by step: study area, deforestation signal, baseline construction, additionality, leakage, carbon conversion, and an independent validation check. All code referenced here lives in [`scripts/acre_redd_baseline.js`](../scripts/acre_redd_baseline.js) and was run in the [Google Earth Engine Code Editor](https://code.earthengine.google.com/). This document is the narrative complement to that script, not a re-implementation of it — no code cells are reproduced here; see the script directly for exact implementation.

## 1. Study area

Acre is a state in the western Brazilian Amazon, bordering Peru and Bolivia. It is home to [SISA (Sistema de Incentivos a Serviços Ambientais)](https://www2.cifor.org/redd-case-book/case-reports/brazil/acres-state-system-incentives-environmental-services-sisa-brazil/), established under State Law 2.308 in 2010 — widely regarded as the world's first jurisdictional REDD+ program. Because SISA applies statewide rather than to a discrete project boundary, this analysis uses 2010 as the natural baseline/project-period split: 2001–2009 as the historical reference period, 2010–2025 as the project period.

The state boundary was obtained from FAO GAUL 2015 administrative boundaries, filtered to `ADM0_NAME = 'Brazil'` and `ADM1_NAME = 'Acre'`.

![Acre deforestation pattern with leakage buffer](../figures/acre_deforestation_pattern.png)
*Figure 1: Hansen Global Forest Change loss-year (2001–2025) within Acre, with a 50km buffer zone (orange) used later for the leakage comparison, restricted to Brazilian territory to avoid conflating cross-border deforestation drivers.*

## 2. Deforestation signal

Annual forest loss was extracted from Hansen Global Forest Change v1.13 (`UMD/hansen/global_forest_change_2025_v1_13`), using the `lossyear` band. Two masking steps were applied before any area calculation:

- **Forest mask**: pixels were required to have ≥30% canopy cover in 2000 (`treecover2000` band), a threshold consistent with forest definitions commonly used in national UNFCCC reporting. This excludes savanna/sparse-shrub pixels that would otherwise register as spurious "loss."
- **Sentinel value removal**: Hansen encodes "no loss detected" as `lossyear = 0` — this is not the year 2000, and was explicitly excluded before converting pixel counts to a real annual time series.

Pixel counts were converted to hectares using the dataset's native ~30m resolution (0.09 ha/pixel) and aggregated into an annual hectares-lost time series for Acre.

## 3. Baseline construction

Two counterfactual baselines were built from the 2001–2009 reference period and projected forward through 2010–2025:

- **Flat historical average** — the simple mean annual loss rate over 2001–2009, held constant for the entire project period.
- **Linear trend** — a least-squares fit of loss vs. year over the same reference period, extrapolated forward.

These represent two ends of a real methodological debate in REDD+ baseline-setting (reflected in VM0007 and successor methodologies): a flat average assumes the pre-policy rate was stable, while a trend extrapolation assumes whatever direction deforestation was already moving would have continued. Neither is presented here as correct; both are shown to make the sensitivity visible.

## 4. Additionality

Cumulative actual deforestation (from Hansen) was compared against both cumulative baseline projections over the 2010–2025 project period.

![Additionality wedge](../figures/additionality_plot.png)
*Figure 2: Cumulative actual vs. flat-baseline deforestation, Acre, Brazil (2010–2025).*

**Key finding**: cumulative actual deforestation rises above the flat-baseline counterfactual after approximately 2020, meaning this simple model does not show clean additionality for the full project period. The most plausible explanation is the well-documented Amazon-wide deforestation surge of 2019–2022, linked to reduced federal environmental enforcement over that period — a national-level driver that a state-specific, pre-2010 flat baseline cannot anticipate. This is reported as a genuine result of the modeling exercise, not adjusted after the fact to produce a cleaner story. It is also, in itself, an illustration of why baseline choice is contested: the trend-adjusted baseline (see script output) tells a somewhat different story than the flat baseline, and a real jurisdictional accounting exercise would need to justify its choice explicitly rather than default to either.

## 5. Leakage

VM0007's REDD+ methodology framework accounts for leakage empirically, using a "leakage belt" — a defined area around the project that is monitored the same way as the project itself, rather than a flat discount rate. This analysis follows that conceptual approach at a simplified scale: annual forest loss was compared between Acre and a 50km buffer zone just outside its border (restricted to Brazilian territory only, to avoid mixing in deforestation dynamics from Peru or Bolivia, which have different drivers and data quality).

![Acre vs buffer annual forest loss](../figures/acre_vs_buffer_loss.png)
*Figure 3: Annual forest loss, Acre (red) vs. 50km external buffer (orange).*

**Key finding**: the two series largely move together rather than diverging — there is no clear pattern of Acre's loss declining while the buffer's rises, which is what a genuine leakage/displacement effect would look like. This suggests both areas are responding to a shared regional or national driver (e.g., the same 2019–2022 enforcement-related surge noted above) rather than SISA displacing deforestation pressure just across Acre's border. Note that the raw hectare values are not directly comparable in magnitude, since Acre and a 50km ring have different total forest areas; the comparison here is about the shape/timing of the two series, not their absolute levels.

## 6. Carbon conversion

Avoided or excess hectares (from Section 4) were converted to tCO2e using two different approaches, deliberately not blended into one average method:

- **Actual emissions**: computed pixel-by-pixel, using WHRC pantropical aboveground biomass density (`WHRC/biomass/tropical`) masked to the real, observed loss-pixel locations for each year. This is the more defensible approach where real geometry exists.
- **Counterfactual (baseline) emissions**: since no real pixel locations exist for a hypothetical "what would have been lost" scenario, the mean forest biomass density across Acre's forested area was applied to the baseline hectare estimates instead.

Both were converted from biomass to carbon using the standard 0.47 carbon fraction (IPCC 2006 GL default), then to CO2e using the 44/12 molecular weight ratio.

## 7. Independent validation

Hansen-derived annual loss was compared against INPE's PRODES annual deforestation rates for Acre, obtained via TerraBrasilis. Two known sources of expected divergence were accounted for before comparison:

- **Date convention**: PRODES years run 1 August–31 July, not the calendar year Hansen's `lossyear` band uses; this offset was accounted for before merging the two series.
- **Definitional differences**: PRODES specifically targets clear-cut deforestation with a ~6.25 ha minimum mapping unit, while Hansen's algorithm captures some forest degradation and smaller clearings; Hansen is expected to read somewhat higher for this reason, independent of any error in either dataset.

[Add specific comparison numbers/chart here once finalized.]

## Limitations

See the [README](../README.md#limitations) for the full limitations list. In summary: the 30% canopy threshold, the static (circa-2012) WHRC biomass snapshot, the sensitivity of additionality conclusions to baseline choice (demonstrated directly in Section 4), the simplified (non-VM0007-compliant) leakage buffer, expected Hansen/PRODES definitional divergence, and the absence of formal uncertainty quantification are all real simplifications in this analysis, not oversights being minimized.
