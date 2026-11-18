export type AcademicYearStatus = "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED";
export type SchoolStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

const academicYearTransitions: Record<AcademicYearStatus, readonly AcademicYearStatus[]> = {
  DRAFT: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["ACTIVE", "CLOSED"],
  CLOSED: ["CLOSED", "ARCHIVED"],
  ARCHIVED: ["ARCHIVED"],
};

const schoolStatusTransitions: Record<SchoolStatus, readonly SchoolStatus[]> = {
  ACTIVE: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  ARCHIVED: ["ARCHIVED"],
};

export function assertAcademicYearTransition(current: AcademicYearStatus, next: AcademicYearStatus) {
  if (!academicYearTransitions[current].includes(next)) {
    throw new Error(`Invalid academic year transition: ${current} to ${next}.`);
  }
}

export function assertSchoolStatusTransition(current: SchoolStatus, next: SchoolStatus) {
  if (!schoolStatusTransitions[current].includes(next)) {
    throw new Error(`Invalid school status transition: ${current} to ${next}.`);
  }
}
