export interface RequestObservation {
  request: Request;
  requestId: string;
}

export function observeRequest(
  request: Request,
  handler: (observation: RequestObservation) => Promise<Response>,
): Promise<Response>;