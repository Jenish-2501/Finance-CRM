import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { roundCurrency } from '../../src/utils/calculations';
import { oracleRound2, oracleSum2, expectMoney } from '../helpers/oracle';
import { check } from '../helpers/fcSeed';

describe('roundCurrency — classic float-drift cases', () => {
  it('0.1 + 0.2 === 0.3', () => {
    expectMoney(roundCurrency(0.1 + 0.2), 0.3);
  });
  it('1.005 * 100 === 100.5', () => {
    expectMoney(roundCurrency(1.005 * 100), 100.5);
  });
  it('19.99 * 3 === 59.97', () => {
    expectMoney(roundCurrency(19.99 * 3), 59.97);
  });
  it('running sum of one hundred 0.01 amounts === 1', () => {
    let acc = 0;
    for (let i = 0; i < 100; i++) acc = roundCurrency(acc + 0.01);
    expectMoney(acc, 1);
    expectMoney(acc, oracleSum2(new Array(100).fill(0.01)));
  });
});

describe('roundCurrency — half-cent tie witnesses (BUG-001/BUG-002 oracle answers)', () => {
  const witnesses: Array<[number, number]> = [
    [2.675, 2.67],
    [1.005, 1.0],
    [1.015, 1.01],
    [1.025, 1.02],
    [1.035, 1.03],
    [0.975, 0.97],
    [0.985, 0.98],
    [2.655, 2.65],
    [2.695, 2.69],
    [0.015, 0.01],
    [-0.025, -0.03],
    [-0.005, -0.01],
  ];
  for (const [input, expected] of witnesses) {
    it(`roundCurrency(${input}) === ${expected} (and matches oracle)`, () => {
      expectMoney(oracleRound2(input), expected); // oracle first: proves expectation is independent
      expectMoney(roundCurrency(input), expected);
    });
  }
});

describe('roundCurrency — zero, sign, magnitude, non-finite', () => {
  it('zero and near-zero', () => {
    expectMoney(roundCurrency(0), 0);
    expectMoney(roundCurrency(-0.0014), 0);
    expectMoney(roundCurrency(0.0049), 0);
    expectMoney(roundCurrency(-0.0049), 0);
    expectMoney(roundCurrency(1e-9), 0);
  });
  it('sign symmetry', () => {
    expectMoney(roundCurrency(123.456), 123.46);
    expectMoney(roundCurrency(-123.456), -123.46);
  });
  it('very large integers pass through (runtime oracle)', () => {
    for (const x of [Number.MAX_SAFE_INTEGER, 1e15, 123456789012.0, -987654321098.0]) {
      expectMoney(roundCurrency(x), oracleRound2(x));
    }
  });
  it('NaN stays NaN, infinities pass through', () => {
    expect(Number.isNaN(roundCurrency(NaN))).toBe(true);
    expect(roundCurrency(Infinity)).toBe(Infinity);
    expect(roundCurrency(-Infinity)).toBe(-Infinity);
  });
});

describe('roundCurrency — property: agrees with oracle on random finite doubles', () => {
  it('roundCurrency(x) === oracleRound2(x) for 5000 seeded cases', () => {
    check(
      fc.property(fc.double({ min: -1e12, max: 1e12, noNaN: true }), (x) => {
        if (!Number.isFinite(x)) return;
        expectMoney(roundCurrency(x), oracleRound2(x));
      }),
      5000
    );
  });
  it('running-round accumulation stays within 1 paisa per term of the exact sum', () => {
    check(
      fc.property(
        fc.array(fc.integer({ min: -100000, max: 100000 }), { minLength: 1, maxLength: 50 }),
        (paise) => {
          const amounts = paise.map((p) => p / 100);
          let acc = 0;
          for (const a of amounts) acc = roundCurrency(acc + a);
          const exact = oracleSum2(amounts);
          expect(Math.abs(acc - exact)).toBeLessThanOrEqual(amounts.length * 0.01 + 1e-9);
        }
      ),
      2000
    );
  });
});
