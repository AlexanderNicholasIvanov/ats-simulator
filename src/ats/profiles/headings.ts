// Shared heading vocabularies (lower-case). Strict parsers only know the classic headings;
// lenient ones also accept the many variants recruiters see in practice.
import type { SectionKind } from '../../types.ts';

export type HeadingMap = Partial<Record<SectionKind, string[]>>;

export const STRICT_HEADINGS: HeadingMap = {
  summary: ['summary', 'professional summary', 'objective'],
  experience: ['experience', 'work experience', 'professional experience'],
  education: ['education'],
  skills: ['skills', 'technical skills'],
  projects: ['projects'],
  certifications: ['certifications'],
  contact: ['contact', 'contact information'],
};

export const MODERATE_HEADINGS: HeadingMap = {
  summary: ['summary', 'professional summary', 'profile', 'objective', 'career objective', 'about me'],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
    'work history',
  ],
  education: ['education', 'education and training', 'academic background'],
  skills: ['skills', 'technical skills', 'core competencies', 'key skills'],
  projects: ['projects', 'key projects'],
  certifications: ['certifications', 'certificates', 'licenses and certifications'],
  contact: ['contact', 'contact information'],
};

export const LENIENT_HEADINGS: HeadingMap = {
  summary: [
    'summary',
    'professional summary',
    'profile',
    'professional profile',
    'objective',
    'career objective',
    'about',
    'about me',
    'overview',
    'career summary',
    'summary of qualifications',
    'qualifications',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'relevant experience',
    'employment',
    'employment history',
    'work history',
    'career history',
    'professional background',
    'career',
    'positions held',
  ],
  education: ['education', 'education and training', 'academic background', 'academics', 'qualifications and education'],
  skills: [
    'skills',
    'technical skills',
    'core competencies',
    'competencies',
    'key skills',
    'skills and tools',
    'technologies',
    'tech stack',
    'tools',
    'expertise',
    'areas of expertise',
  ],
  projects: ['projects', 'key projects', 'selected projects', 'personal projects', 'portfolio'],
  certifications: ['certifications', 'certificates', 'licenses', 'licenses and certifications', 'courses'],
  contact: ['contact', 'contact information', 'contact details'],
};
