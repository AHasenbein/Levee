// Assumptions + five seeded DEMO properties. All values are illustrative placeholders,
// not real Austin data and not a FEMA lookup.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Data = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ASSUMPTIONS = {
    probPerYearInZone: { value: 0.01, basis: "FEMA 1-percent zone definition; confirm per zone" },
    probPerYearOutsideZone: { value: 0.002, basis: "Placeholder assumption" },
    vacantMonths: { value: 3, basis: "Assumption" },
    deductibleUsd: { value: 5000, basis: "Assumption; varies by policy" },
    uninsuredRepairUsd: { value: 1000, basis: "Assumption" },
    premiumMultiplier: { value: 1.0, basis: "Assumption; v1 has no premium model" },
    holdYears: { value: 30, basis: "Matches a 30-year mortgage" },
    paths: { value: 10000, basis: "Balances speed and noise" },
    seed: { value: 42, basis: "Fixed for reproducibility" },
    yearsIndependent: { value: true, basis: "v1 treats years as independent" },
  };

  const mk = (id, name, zone, inZone, rent, other, ins, debt) => ({
    id, name, zone, inZone,
    deal: {
      annualRentUsd: rent,
      otherOperatingCostsUsdPerYear: other,
      insuranceUsdPerYear: ins,
      debtServiceUsdPerYear: debt,
      holdYears: ASSUMPTIONS.holdYears.value,
    },
    probPerYear: inZone ? ASSUMPTIONS.probPerYearInZone.value : ASSUMPTIONS.probPerYearOutsideZone.value,
  });

  const PROPERTIES = [
    mk("p1", "Demo Duplex A, East Austin", "AE (1% zone) - demo label", true, 30000, 7000, 2000, 16000),
    mk("p2", "Demo Bungalow B, Montopolis", "AE (1% zone) - demo label", true, 36000, 8000, 2400, 15000),
    mk("p3", "Demo Condo C, Mueller", "X (outside) - demo label", false, 28000, 6500, 1800, 14000),
    mk("p4", "Demo House D, Circle C", "X (outside) - demo label", false, 48000, 9000, 2800, 12000),
    mk("p5", "Demo Fourplex E, Riverside", "AE (1% zone) - demo label", true, 33000, 7500, 2200, 17500),
  ];

  const scenarioFromAssumptions = () => ({
    vacantMonths: ASSUMPTIONS.vacantMonths.value,
    deductibleUsd: ASSUMPTIONS.deductibleUsd.value,
    uninsuredRepairUsd: ASSUMPTIONS.uninsuredRepairUsd.value,
    premiumMultiplier: ASSUMPTIONS.premiumMultiplier.value,
  });

  return { ASSUMPTIONS, PROPERTIES, scenarioFromAssumptions };
});
