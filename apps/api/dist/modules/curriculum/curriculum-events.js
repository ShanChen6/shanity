var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
export const COURSE_CURRICULUM_CHANGED = 'course.curriculum.updated';
let CurriculumEvents = class CurriculumEvents {
    emitter = new EventEmitter();
    emitChanged(event) {
        this.emitter.emit(COURSE_CURRICULUM_CHANGED, event);
    }
    onChanged(listener) {
        const wrapped = (event) => {
            void Promise.resolve()
                .then(() => listener(event))
                .catch(() => undefined);
        };
        this.emitter.on(COURSE_CURRICULUM_CHANGED, wrapped);
        return () => this.emitter.off(COURSE_CURRICULUM_CHANGED, wrapped);
    }
};
CurriculumEvents = __decorate([
    Injectable()
], CurriculumEvents);
export { CurriculumEvents };
//# sourceMappingURL=curriculum-events.js.map