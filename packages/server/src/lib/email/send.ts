import { getResendClient } from "./client";
import { TeamAddedEmail } from "./templates/team-added";
import { WelcomePreviewEmail } from "./templates/welcome-preview";
import { env } from "../env";
import { logger } from "../logger";

const DEFAULT_FROM_EMAIL = "Philipp from AgentLogs <philipp@agentlogs.ai>";
const FROM_EMAIL = env.EMAIL_SENDER.trim() || DEFAULT_FROM_EMAIL;

function getPublicUrl(path: string): string {
  return new URL(path, env.WEB_URL).toString();
}

export async function sendWelcomePreviewEmail(to: string, name: string): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to the AgentLogs Preview",
      react: WelcomePreviewEmail({
        name,
        docsUrl: getPublicUrl("/docs"),
        logoUrl: getPublicUrl("/email-logo.png"),
      }),
    });

    if (error) {
      logger.error("Failed to send welcome email", { to, error });
      return { success: false, error: error.message };
    }

    logger.info("Welcome email sent", { to });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Exception sending welcome email", { to, error: message });
    return { success: false, error: message };
  }
}

export async function sendTeamAddedEmail(
  to: string,
  name: string,
  teamName: string,
  addedByName: string,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You've been added to ${teamName}`,
      react: TeamAddedEmail({
        name,
        teamName,
        addedByName,
        appUrl: getPublicUrl("/app"),
        logoUrl: getPublicUrl("/email-logo.png"),
      }),
    });

    if (error) {
      logger.error("Failed to send team added email", { to, error });
      return { success: false, error: error.message };
    }

    logger.info("Team added email sent", { to, teamName });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Exception sending team added email", { to, error: message });
    return { success: false, error: message };
  }
}
