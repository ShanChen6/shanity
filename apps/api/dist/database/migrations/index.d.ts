import { Foundation1790467200001 } from './202609270001_foundation.js';
import { Chapters1790899200003 } from './202610020003_chapters.js';
export declare const migrationHistory: ({
    legacy: string;
    name: string;
    timestamp: number;
    migration: typeof Foundation1790467200001;
} | {
    legacy: null;
    name: string;
    timestamp: number;
    migration: typeof Chapters1790899200003;
})[];
export declare const migrations: (typeof Foundation1790467200001 | typeof Chapters1790899200003)[];
