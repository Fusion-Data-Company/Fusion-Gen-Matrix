export class AppError extends Error { constructor(public code:string,message:string,public status=400){super(message);this.name="AppError";} }
export function notFound():never{throw new AppError("NOT_FOUND","This item is unavailable.",404);}
