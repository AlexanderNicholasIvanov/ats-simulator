// Default ATS profiles in registry order. To add an ATS: add one file in this folder and register it here.
import type { AtsProfile } from '../../types.ts';
import { workday } from './workday.ts';
import { taleo } from './taleo.ts';
import { icims } from './icims.ts';
import { greenhouse } from './greenhouse.ts';
import { lever } from './lever.ts';
import { successfactors } from './successfactors.ts';
import { smartrecruiters } from './smartrecruiters.ts';
import { jobvite } from './jobvite.ts';

export const PROFILES: AtsProfile[] = [
  workday,
  taleo,
  icims,
  greenhouse,
  lever,
  successfactors,
  smartrecruiters,
  jobvite,
];
