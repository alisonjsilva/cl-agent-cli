import React from "react";
import { Text } from "ink";
import { EnvironmentType } from "../config/schema.js";

const ENV_COLORS: Record<EnvironmentType, string> = {
  production: "red",
  staging: "yellow",
  test: "green",
  unknown: "gray",
};

const ENV_LABELS: Record<EnvironmentType, string> = {
  production: " PROD ",
  staging: " STAGING ",
  test: " TEST ",
  unknown: " ??? ",
};

export const EnvBadge: React.FC<{ env: EnvironmentType }> = ({ env }) => {
  const color = ENV_COLORS[env];
  return (
    <Text bold color="white" backgroundColor={color}>
      {ENV_LABELS[env]}
    </Text>
  );
};
