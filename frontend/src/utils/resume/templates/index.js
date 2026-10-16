import academicAchievement from './academicAchievement';
import atsClassic from './atsClassic';
import fresherAtsClassic from './fresherAtsClassic';
import internshipApplicant from './internshipApplicant';
import minimalOnePage from './minimalOnePage';
import minimalProfessional from './minimalProfessional';
import modernDeveloper from './modernDeveloper';
import modernGraduate from './modernGraduate';
import softwareDeveloperFresher from './softwareDeveloperFresher';
import twoColumnProfessional from './twoColumnProfessional';

/**
 * The drawing code of each template, by id. Names, descriptions, categories, colours and fonts on offer
 * come from the server (GET /resumes/options, backend/data/resumeOptions.js).
 */
export const TEMPLATE_LAYOUTS = Object.freeze(
  Object.fromEntries(
    [fresherAtsClassic, modernGraduate, softwareDeveloperFresher, internshipApplicant, minimalOnePage, academicAchievement, atsClassic, modernDeveloper, minimalProfessional, twoColumnProfessional].map((template) => [template.id, template]),
  ),
);
