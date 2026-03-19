import { Project, SyntaxKind, Node } from 'ts-morph';
import { basename, extname } from 'path';

export interface ComponentDef {
  name: string;
  filePath: string;
  source: 'primitives' | 'components';
  variants: Record<string, string[]>;
  baseClasses: string[];
  variantClasses: Record<string, Record<string, string>>;
  icons: string[];
  props: Record<string, string>;
  exports: string[];       // all exported component names from this file
  hasVariants: boolean;    // has cva() variants
  subComponents: string[]; // e.g. CardHeader, CardContent found in same file
}

// ---------------------------------------------------------------------------
// ts-morph Project singleton
// ---------------------------------------------------------------------------

let _project: Project | null = null;
function getProject(): Project {
  if (!_project) {
    _project = new Project({ compilerOptions: { jsx: 4 /* ReactJSX */ } });
  }
  return _project;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a name looks like a React component (PascalCase) */
function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/** Extract Tailwind classes from cn() or className strings */
function extractClassesFromCn(node: Node): string[] {
  const classes: string[] = [];
  // Find string literals that look like Tailwind classes
  node.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach(str => {
    const text = str.getText().replace(/['"]/g, '');
    // Only grab strings that look like Tailwind classes (contain hyphens, common patterns)
    if (text.includes(' ') && /\b(flex|grid|bg-|text-|p-|px-|py-|m-|mx-|rounded|border|h-|w-|gap-|items-|justify-)/.test(text)) {
      classes.push(...text.split(/\s+/).filter(Boolean));
    }
  });
  return [...new Set(classes)];
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export function scanComponentFile(filePath: string, source: 'primitives' | 'components' = 'primitives'): ComponentDef | null {
  const project = getProject();

  // Remove existing source file if already added (singleton project accumulates)
  const existing = project.getSourceFile(filePath);
  if (existing) project.removeSourceFile(existing);

  const sourceFile = project.addSourceFileAtPath(filePath);

  const variants: Record<string, string[]> = {};
  const variantClasses: Record<string, Record<string, string>> = {};
  let baseClasses: string[] = [];
  const icons: string[] = [];
  const props: Record<string, string> = {};
  const exports: string[] = [];
  const subComponents: string[] = [];

  // ----- 1. Find cva() calls (variant-based components) -----
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
    if (call.getExpression().getText() !== 'cva') return;
    const args = call.getArguments();
    if (args.length < 2) return;

    const baseArg = args[0];
    if (baseArg.getKind() === SyntaxKind.StringLiteral) {
      baseClasses = baseArg.getText().replace(/['"]/g, '').split(/\s+/).filter(Boolean);
    }

    const configArg = args[1];
    if (configArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const obj = configArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const variantsProp = obj.getProperty('variants');

      if (variantsProp?.getKind() === SyntaxKind.PropertyAssignment) {
        try {
          const variantsObj = variantsProp.asKindOrThrow(SyntaxKind.PropertyAssignment)
            .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

          variantsObj.getProperties().forEach(prop => {
            if (prop.getKind() !== SyntaxKind.PropertyAssignment) return;
            const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment);
            const variantName = pa.getName();
            const valuesObj = pa.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);

            if (valuesObj) {
              variants[variantName] = [];
              variantClasses[variantName] = {};
              valuesObj.getProperties().forEach(vp => {
                if (vp.getKind() !== SyntaxKind.PropertyAssignment) return;
                const vpa = vp.asKindOrThrow(SyntaxKind.PropertyAssignment);
                const key = vpa.getName().replace(/^["']|["']$/g, '');
                const value = vpa.getInitializer()?.getText().replace(/['"]/g, '') ?? '';
                variants[variantName].push(key);
                variantClasses[variantName][key] = value;
              });
            }
          });
        } catch {
          // variants parsing failed — continue with what we have
        }
      }
    }
  });

  // ----- 2. Find ALL exported components -----
  // Detect: export const Foo = React.forwardRef(...)
  //         export function Foo(...)
  //         export { Foo }
  //         const Foo = React.forwardRef(...) + export { Foo }

  // Named exports: export const X = ... or export function X
  sourceFile.getExportedDeclarations().forEach((decls, name) => {
    if (isPascalCase(name)) {
      exports.push(name);
    }
  });

  // Also check for forwardRef patterns — these are the most common shadcn pattern:
  // const Card = React.forwardRef<HTMLDivElement, ...>(({ className, ...props }, ref) => (
  sourceFile.getVariableDeclarations().forEach(decl => {
    const name = decl.getName();
    if (!isPascalCase(name)) return;

    const init = decl.getInitializer();
    if (!init) return;

    const text = init.getText();
    // React.forwardRef or forwardRef pattern
    if (text.includes('forwardRef') || text.includes('React.forwardRef')) {
      if (!exports.includes(name)) {
        // Check if it's exported somewhere
        const isExported = sourceFile.getExportedDeclarations().has(name);
        if (isExported) exports.push(name);
      }
    }
  });

  // ----- 3. Identify sub-components (e.g. CardHeader, CardContent) -----
  const fileName = basename(filePath, extname(filePath));
  const primaryName = fileName.charAt(0).toUpperCase() + fileName.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  for (const exp of exports) {
    if (exp !== primaryName && exp.startsWith(primaryName)) {
      subComponents.push(exp);
    }
  }

  // ----- 4. Find icon imports -----
  sourceFile.getImportDeclarations().forEach(imp => {
    const module = imp.getModuleSpecifierValue();
    if (module.includes('lucide') || module.includes('heroicons') || module.includes('icons')) {
      imp.getNamedImports().forEach(named => {
        icons.push(named.getName());
      });
    }
  });

  // ----- 5. Find Props interface/type -----
  sourceFile.getInterfaces().forEach(iface => {
    if (iface.getName().endsWith('Props')) {
      iface.getProperties().forEach(prop => {
        props[prop.getName()] = prop.getType().getText();
      });
    }
  });

  // Also check type aliases: type CardProps = ...
  sourceFile.getTypeAliases().forEach(alias => {
    if (alias.getName().endsWith('Props')) {
      // For intersection/object types, try to extract property names
      const typeNode = alias.getTypeNode();
      if (typeNode) {
        typeNode.getDescendantsOfKind(SyntaxKind.PropertySignature).forEach(prop => {
          props[prop.getName()] = prop.getType().getText();
        });
      }
    }
  });

  // ----- 6. Extract Tailwind classes from cn() calls (for non-cva components) -----
  if (baseClasses.length === 0) {
    baseClasses = extractClassesFromCn(sourceFile);
  }

  // ----- Return -----
  // A file is a component if it exports at least one PascalCase name
  if (exports.length === 0) {
    return null;
  }

  return {
    name: basename(filePath, extname(filePath)),
    filePath,
    source,
    variants,
    baseClasses,
    variantClasses,
    icons,
    props,
    exports,
    hasVariants: Object.keys(variants).length > 0,
    subComponents,
  };
}
