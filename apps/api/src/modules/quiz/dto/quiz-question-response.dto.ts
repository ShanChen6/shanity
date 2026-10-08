import type { QuizEntity } from '../entities/quiz.entity.js';
import type {
  QuizQuestionEntity,
  QuizQuestionType,
} from '../entities/quiz-question.entity.js';
import type { QuizOptionEntity } from '../entities/quiz-option.entity.js';
import type { EssayConfig } from '../domain/assessment.types.js';

// Learner DTOs are built field by field from an allow-list, never by spreading
// an entity, so a new sensitive column cannot leak by default.

export type LearnerOptionSource = Pick<
  QuizOptionEntity,
  'id' | 'content' | 'position'
>;
export type LearnerQuestionSource = Pick<
  QuizQuestionEntity,
  'id' | 'type' | 'content' | 'position' | 'points'
> & {
  essayConfig?: EssayConfig | null;
  options: LearnerOptionSource[];
};

export type LearnerEssayConfig = Pick<
  EssayConfig,
  'allowedSubmissionTypes' | 'maxFileUploads' | 'maxWords'
>;

function learnerEssayConfig(config: EssayConfig): LearnerEssayConfig {
  return {
    allowedSubmissionTypes: config.allowedSubmissionTypes,
    maxFileUploads: config.maxFileUploads,
    ...(config.maxWords !== undefined && { maxWords: config.maxWords }),
  };
}

export class LearnerOptionResponseDto {
  id: string;
  content: string;
  position: number;

  static from(option: LearnerOptionSource): LearnerOptionResponseDto {
    return Object.assign(new LearnerOptionResponseDto(), {
      id: option.id,
      content: option.content,
      position: option.position,
    });
  }
}

/** A question as shown while taking a quiz: no answer key, no explanation. */
export class LearnerQuestionResponseDto {
  id: string;
  type: QuizQuestionType;
  content: string;
  position: number;
  points: number;
  essayConfig?: LearnerEssayConfig;
  options: LearnerOptionResponseDto[];

  static from(question: LearnerQuestionSource): LearnerQuestionResponseDto {
    return Object.assign(new LearnerQuestionResponseDto(), {
      id: question.id,
      type: question.type,
      content: question.content,
      position: question.position,
      points: question.points,
      ...(question.essayConfig && {
        essayConfig: learnerEssayConfig(question.essayConfig),
      }),
      options: question.options.map((option) =>
        LearnerOptionResponseDto.from(option),
      ),
    });
  }
}

export type LearnerQuizSource = Pick<
  QuizEntity,
  'id' | 'title' | 'description' | 'durationMinutes' | 'passingScore'
>;

export class LearnerQuizResponseDto {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  passingScore: number;
  questions: LearnerQuestionResponseDto[];

  static from(
    quiz: LearnerQuizSource,
    questions: LearnerQuestionSource[],
  ): LearnerQuizResponseDto {
    return Object.assign(new LearnerQuizResponseDto(), {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      durationMinutes: quiz.durationMinutes,
      passingScore: quiz.passingScore,
      questions: questions.map((question) =>
        LearnerQuestionResponseDto.from(question),
      ),
    });
  }
}

export class InstructorOptionResponseDto {
  id: string;
  content: string;
  position: number;
  isCorrect: boolean;
  createdAt: Date;

  static from(option: QuizOptionEntity): InstructorOptionResponseDto {
    return Object.assign(new InstructorOptionResponseDto(), {
      id: option.id,
      content: option.content,
      position: option.position,
      isCorrect: option.isCorrect,
      createdAt: option.createdAt,
    });
  }
}

/** Full authoring view, answer key and explanation included. */
export class InstructorQuestionResponseDto {
  id: string;
  quizId: string;
  type: QuizQuestionType;
  content: string;
  position: number;
  points: number;
  essayConfig: EssayConfig | null;
  explanation: string | null;
  createdAt: Date;
  updatedAt: Date;
  options: InstructorOptionResponseDto[];

  static from(question: QuizQuestionEntity): InstructorQuestionResponseDto {
    return Object.assign(new InstructorQuestionResponseDto(), {
      id: question.id,
      quizId: question.quizId,
      type: question.type,
      content: question.content,
      position: question.position,
      points: question.points,
      essayConfig: question.essayConfig,
      explanation: question.explanation,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      options: (question.options ?? []).map((option) =>
        InstructorOptionResponseDto.from(option),
      ),
    });
  }
}
