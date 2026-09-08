import { vi } from "vitest";

vi.mock("./module");

export function chained(value: string): number {
	return value as unknown as number;
}

export function conditionalSpread(flag: boolean): { a?: number } {
	return { ...(flag ? { a: 1 } : {}) };
}

export const widened: object = { known: true };

export function objectParameter(input: object): void {
	console.log(input);
}

export function reflectApply(target: () => void): void {
	Reflect.apply(target, undefined, []);
}

export function reflectGet(target: { a: number }): number {
	return Reflect.get(target, "a");
}

export function runtimeTypeof(value: string | number): boolean {
	return typeof value === "string";
}

export const userShape = 1;

export function unknownParameter(value: unknown): void {
	console.log(value);
}

export function unknownReturn(): unknown {
	return 1;
}

export type Loose = unknown;

export type Dictionary = Record<string, unknown>;

export function widenThenAssert(): number {
	const value: unknown = 1;
	return value as number;
}

export function unsafeAssertion(value: string): number {
	return value as never;
}
