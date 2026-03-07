import { Button, Section, Text } from "@react-email/components";
import { EmailLayout } from "./layout";

interface WelcomePreviewEmailProps {
  docsUrl: string;
  name: string;
  logoUrl: string;
}

export function WelcomePreviewEmail({ docsUrl, name, logoUrl }: WelcomePreviewEmailProps) {
  return (
    <EmailLayout logoUrl={logoUrl} preview={`Welcome to AgentLogs, ${name}!`}>
      <Text style={greeting}>Hi {name},</Text>

      <Text style={text}>
        You're in! Your AgentLogs account is now active. Install the CLI plugin to start tracking your AI coding
        sessions.
      </Text>

      <Section style={buttonContainer}>
        <Button style={button} href={docsUrl}>
          Get started
        </Button>
      </Section>
    </EmailLayout>
  );
}

export default WelcomePreviewEmail;

const greeting = {
  color: "#ffffff",
  fontSize: "15px",
  lineHeight: "1.5",
  margin: "0 0 16px",
};

const text = {
  color: "#a3a3a3",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0 0 24px",
};

const buttonContainer = {
  margin: "0",
};

const button = {
  backgroundColor: "#ffffff",
  borderRadius: "6px",
  color: "#1a1a1a",
  display: "inline-block",
  fontSize: "13px",
  fontWeight: "500",
  padding: "10px 20px",
  textDecoration: "none",
};
