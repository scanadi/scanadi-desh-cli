import chalk from 'chalk';

export function success(msg: string): void {
  console.log(chalk.green('✓'), msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗'), msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('ℹ'), msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠'), msg);
}

/** Inline progress indicator — overwrites the current line */
export function progress(current: number, total: number, label: string): void {
  process.stdout.write(`\r${chalk.gray(`  ${label} (${current}/${total})`)}\x1b[K`);
}

/** Clear the progress line */
export function progressDone(): void {
  process.stdout.write('\r\x1b[K');
}

/** Show a spinner-style status message (no count, just "doing X...") */
export function status(msg: string): void {
  process.stdout.write(`\r${chalk.gray(`  ${msg}`)}\x1b[K`);
}

/** Print a result — handles string or object */
export function printResult(result: unknown): void {
  if (typeof result === 'string') {
    console.log(result);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

/** Handle command error and exit */
export function exitOnError(err: unknown): never {
  error(String((err as Error).message));
  process.exit(1);
}

/** Visual progress bar with label, count, and current item */
export function progressBar(current: number, total: number, label: string, item?: string): void {
  const width = 24;
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * width);
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(width - filled));
  const pctStr = `${Math.round(pct * 100)}%`;
  const itemStr = item ? chalk.gray(` ${item}`) : '';
  process.stdout.write(`\r  ${label} ${bar} ${chalk.white(`${current}/${total}`)} ${chalk.gray(pctStr)}${itemStr}\x1b[K`);
}
