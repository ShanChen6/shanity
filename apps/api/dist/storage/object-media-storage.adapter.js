import { ServiceUnavailableException } from '@nestjs/common';
export class ObjectMediaStorageAdapter {
    provider = 'S3';
    unavailable() {
        throw new ServiceUnavailableException('Object media storage adapter is not configured');
    }
    upload(_file, _path, _metadata) {
        return this.unavailable();
    }
    delete(_filePath) {
        return this.unavailable();
    }
    getSignedUrl(_filePath, _expiresInSeconds) {
        return this.unavailable();
    }
    getStream(_filePath, _range) {
        return this.unavailable();
    }
}
//# sourceMappingURL=object-media-storage.adapter.js.map