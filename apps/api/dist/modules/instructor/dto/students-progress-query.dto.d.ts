export declare const STUDENT_SORTS: readonly ["percentage_desc", "percentage_asc", "last_accessed_desc"];
export declare const STUDENT_STATUSES: readonly ["ALL", "COMPLETED", "IN_PROGRESS", "NOT_STARTED"];
export type StudentSort = (typeof STUDENT_SORTS)[number];
export type StudentStatusFilter = (typeof STUDENT_STATUSES)[number];
export type StudentProgressStatus = Exclude<StudentStatusFilter, 'ALL'>;
export declare class StudentsProgressQueryDto {
    page: number;
    limit: number;
    search?: string;
    sortBy: StudentSort;
    status: StudentStatusFilter;
}
