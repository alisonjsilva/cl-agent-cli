#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});

render(<App />);
