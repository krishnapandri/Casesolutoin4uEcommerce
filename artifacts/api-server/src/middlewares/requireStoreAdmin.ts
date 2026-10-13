import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const requireStoreAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const allowedEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowedEmails.size === 0) {
    res.status(503).json({ error: "Staff access is not configured yet." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isStaff = user.emailAddresses.some((address) =>
      allowedEmails.has(address.emailAddress.toLowerCase()),
    );
    if (!isStaff) {
      res.status(403).json({ error: "Staff access is required." });
      return;
    }
  } catch (error) {
    req.log.error({ error }, "Could not verify store staff access");
    res.status(503).json({ error: "Staff access could not be verified." });
    return;
  }

  next();
};

export default requireStoreAdmin;
