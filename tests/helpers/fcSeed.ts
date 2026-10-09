import * as fc from 'fast-check';

// Fixed seed for reproducibility. Override per run with FC_SEED=<int>.
// Every property test logs the seed it ran with (see check()).
export const FC_SEED: number = Number(process.env.FC_SEED ?? 20261009);

export function check(property: fc.IProperty<unknown>, numRuns = 5000): void {
  console.log(`[fast-check] seed=${FC_SEED} numRuns=${numRuns}`);
  fc.assert(property, { seed: FC_SEED, numRuns });
}
