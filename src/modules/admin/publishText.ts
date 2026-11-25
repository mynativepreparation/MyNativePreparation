import type { TextKey } from '../../core/i18n';
import type { PublishUiErrorCode } from './usePublish';

// Friendly text for every reason a Publish / Unpublish run can fail (P11 T5 step b). One line per code, never a raw error.
// The GitHub codes reuse the login texts (`admin.err.*`); the publish-only codes have their own `admin.publish.err.*` texts.
// `Record<PublishUiErrorCode, TextKey>` makes the compiler complain when a new code is added without a text.

export const PUBLISH_ERROR_TEXT: Record<PublishUiErrorCode, TextKey> = {
  invalid_token: 'admin.err.invalidToken',
  unauthorized: 'admin.err.unauthorized',
  forbidden: 'admin.err.forbidden',
  no_push_right: 'admin.err.noPush',
  rate_limited: 'admin.err.rateLimited',
  not_found: 'admin.err.notFound',
  offline: 'admin.err.offline',
  timeout: 'admin.err.timeout',
  bad_response: 'admin.err.badResponse',
  bad_path: 'admin.err.badResponse',
  too_large: 'admin.publish.err.tooLarge',
  conflict: 'admin.publish.err.conflict',
  invalid: 'admin.publish.err.invalid',
  bad_manifest: 'admin.publish.err.badManifest',
  not_published: 'admin.publish.err.notPublished',
  not_logged_in: 'admin.publish.err.notLoggedIn',
};
