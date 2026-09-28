import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi, hashPassword, jsonError, readJson, userSelect } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createUserSchema, firstError } from "@/lib/validations";

/** Admin creates a staff member or another admin. */
export async function POST(request: Request) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;

  const parsed = createUserSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { password, ...fields } = parsed.data;

  try {
    const user = await prisma.user.create({
      data: { ...fields, passwordHash: await hashPassword(password) },
      select: userSelect,
    });
    return NextResponse.json({ user, message: "User created successfully." }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError("A user with that email already exists.", 409);
    }
    throw e;
  }
}
