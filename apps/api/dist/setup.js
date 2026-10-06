import cookieParser from 'cookie-parser';
import { AuthConfig } from './auth/auth.config.js';
export function configureApp(app) {
    app.use(cookieParser());
    app.enableCors({
        origin: app.get(AuthConfig).origin,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.enableShutdownHooks();
}
//# sourceMappingURL=setup.js.map