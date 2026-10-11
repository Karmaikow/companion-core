export class CrystalError extends Error { constructor(public status: number, message: string, public details?: unknown) { super(message); } }
