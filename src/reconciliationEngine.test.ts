/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateClaimFinancials, validateClaim } from "./reconciliationEngine";
import { ClaimStatus, ClaimClassification } from "./types";

/**
 * Basic Unit Tests for ITERA HEALTH Reconciliation Engine
 */
export function runReconciliationEngineTests() {
  const results: { name: string; success: boolean; error?: string }[] = [];

  function test(name: string, fn: () => void) {
    try {
      fn();
      results.push({ name, success: true });
    } catch (e: any) {
      results.push({ name, success: false, error: e.message || String(e) });
    }
  }

  // Test Case 1: ITERA billed and ITERA collected
  test("Scenario 1: ITERA billed and ITERA collected (70/30 split)", () => {
    const claim = calculateClaimFinancials({
      billed_by: "ITERA",
      payment_received_by: "ITERA",
      billed_charge: 150,
      insurance_adjustment: 30,
      denied_amount: 0,
      itera_direct_collection: 120,
      provider_direct_collection: 0,
      payment_to_physician: 0,
    });

    if (claim.net_collectible_revenue !== 120) {
      throw new Error(`Net collectible revenue expected 120, got ${claim.net_collectible_revenue}`);
    }
    if (claim.total_collections !== 120) {
      throw new Error(`Total collections expected 120, got ${claim.total_collections}`);
    }
    if (claim.ar_balance !== 0) {
      throw new Error(`A/R balance expected 0, got ${claim.ar_balance}`);
    }
    if (claim.itera_ar !== 0) {
      throw new Error(`ITERA A/R expected 0, got ${claim.itera_ar}`);
    }
    // 70% of 120 is 84
    if (claim.account_payable_to_physician !== 84) {
      throw new Error(`Payable to physician expected 84, got ${claim.account_payable_to_physician}`);
    }
    if (claim.ending_ap_to_physician !== 84) {
      throw new Error(`Ending A/P expected 84, got ${claim.ending_ap_to_physician}`);
    }
    if (claim.net_itera_revenue !== 36) {
      throw new Error(`Net ITERA revenue expected 36 (30% of 120), got ${claim.net_itera_revenue}`);
    }
    if (claim.net_provider_revenue !== 84) {
      throw new Error(`Net Provider revenue expected 84, got ${claim.net_provider_revenue}`);
    }
  });

  // Test Case 2: ITERA billed but Provider collected
  test("Scenario 2: ITERA billed but Provider collected", () => {
    const claim = calculateClaimFinancials({
      billed_by: "ITERA",
      payment_received_by: "Provider",
      billed_charge: 100,
      insurance_adjustment: 0,
      denied_amount: 0,
      itera_direct_collection: 0,
      provider_direct_collection: 100,
      payment_to_physician: 0,
    });

    // Net provider share = 70% of 100 = 70.
    // Provider collected 100 directly.
    // So payable to physician = 70 - 100 = -30 (Provider owes ITERA 30).
    if (claim.account_payable_to_physician !== -30) {
      throw new Error(`Payable expected -30, got ${claim.account_payable_to_physician}`);
    }
    if (claim.net_itera_revenue !== 30) {
      throw new Error(`Net ITERA revenue expected 30, got ${claim.net_itera_revenue}`);
    }
  });

  // Test Case 3: Split collection
  test("Scenario 5: Split Collection", () => {
    const claim = calculateClaimFinancials({
      billed_by: "ITERA",
      payment_received_by: "Split",
      billed_charge: 100,
      insurance_adjustment: 0,
      denied_amount: 0,
      itera_direct_collection: 40,
      provider_direct_collection: 60,
      payment_to_physician: 0,
    });

    // Total collection = 100. Provider entitled to 70.
    // Provider collected 60.
    // Payable to physician = 70 - 60 = 10.
    if (claim.account_payable_to_physician !== 10) {
      throw new Error(`Payable expected 10, got ${claim.account_payable_to_physician}`);
    }
    if (claim.net_itera_revenue !== 30) {
      throw new Error(`Net ITERA expected 30, got ${claim.net_itera_revenue}`);
    }
  });

  // Test Case 4: Validation Rule
  test("Validation: Claim ID required", () => {
    const errors = validateClaim({
      claim_id: "  ",
      billed_by: "ITERA",
      payment_received_by: "ITERA",
    });

    if (!errors.includes("Claim ID is required.")) {
      throw new Error("Validation did not catch empty Claim ID.");
    }
  });

  return results;
}
