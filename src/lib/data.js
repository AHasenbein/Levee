// Assumptions + five seeded DEMO properties. All values are illustrative placeholders,
// not real Austin data and not a FEMA lookup.
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

  // Planner assumptions ("Start here"). Illustrative, not quotes and not lookups: every one is shown on screen.
  // Fractions are 0-1, never percents. Kept apart from ASSUMPTIONS so stress responses are unchanged.
  const PLAN_ASSUMPTIONS = {
    mortgageRate: { value: 0.065, basis: "Assumed 30-year mortgage rate, not a quote; use your own" },
    termYears: { value: 30, basis: "Standard 30-year mortgage" },
    rentToPriceMonthly: { value: 0.0075, basis: "Rule of thumb when rent is unknown: monthly rent = 0.75 percent of price" },
    propertyTaxRate: { value: 0.019, basis: "Assumed yearly property tax as a fraction of price; illustrative Texas-like rate, not a lookup" },
    landlordInsuranceRate: { value: 0.007, basis: "Assumed yearly landlord insurance as a fraction of price; not a quote" },
    maintenanceShareOfRent: { value: 0.08, basis: "Assumed repairs set-aside as a share of rent" },
    vacancyShareOfRent: { value: 0.05, basis: "Assumed empty-unit allowance as a share of rent" },
    closingCostShare: { value: 0.03, basis: "Assumed closing costs as a fraction of price" },
    repairBufferShare: { value: 0.01, basis: "Assumed day-one fix-up money as a fraction of price" },
    reserveMonths: { value: 6, basis: "Months of mortgage and costs kept in the bank" },
    reitYield: { value: 0.04, basis: "Assumed REIT dividend yield; varies and is not guaranteed" },
    houseHackDownPaymentFraction: { value: 0.035, basis: "Assumed small owner-occupant loan down payment" },
    houseHackMortgageRate: { value: 0.0625, basis: "Assumed owner-occupant mortgage rate, not a quote" },
    houseHackOwnerShareOfRent: { value: 0.5, basis: "You live in one of two units, so half the rent is not collected" },
    rentalDownPaymentFraction: { value: 0.25, basis: "Assumed down payment on an investment property" },
    managementFeeShareOfRent: { value: 0.1, basis: "Assumed property manager fee as a share of rent" },
    turnkeyPriceMarkup: { value: 0.08, basis: "Assumed premium for an already renovated, rented, managed home" },
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

export { ASSUMPTIONS, PLAN_ASSUMPTIONS, PROPERTIES, scenarioFromAssumptions };
