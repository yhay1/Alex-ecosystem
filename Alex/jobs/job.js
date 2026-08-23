const requiredFields = ["id", "type", "productId", "payload", "createdAt", "updatedAt", "retry"];

export function createJob({ id = crypto.randomUUID(), type, productId, payload, retry = {} }) {
  const timestamp = new Date().toISOString();
  return {
    id,
    type,
    productId,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
    retry: {
      attempt: retry.attempt ?? 0,
      maxAttempts: retry.maxAttempts ?? 3,
    },
  };
}

export function validateJob(job) {
  const errors = [];

  if (!job || typeof job !== "object" || Array.isArray(job)) {
    return { valid: false, errors: ["Job must be an object."] };
  }

  for (const field of requiredFields) {
    if (!(field in job)) {
      errors.push(`${field} is required.`);
    }
  }

  for (const field of ["id", "type", "productId", "createdAt", "updatedAt"]) {
    if (field in job && (typeof job[field] !== "string" || job[field].length === 0)) {
      errors.push(`${field} must be a non-empty string.`);
    }
  }

  if ("retry" in job) {
    if (!job.retry || typeof job.retry !== "object" || Array.isArray(job.retry)) {
      errors.push("retry must be an object.");
    } else {
      for (const field of ["attempt", "maxAttempts"]) {
        if (!Number.isInteger(job.retry[field]) || job.retry[field] < 0) {
          errors.push(`retry.${field} must be a non-negative integer.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}