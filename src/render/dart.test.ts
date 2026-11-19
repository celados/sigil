import { describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CssMode } from '../source/types.ts'
import type { NamedIcon } from './types.ts'

import { hoistPresentation } from '../svg-attrs.ts'
import { dartRenderer, iconTree } from './dart.ts'
import { svgRenderer } from './svg.ts'

const root = join(import.meta.dir, '../..')

/** An icon as etch hands it to a renderer: presentation hoisted to the root. */
function named(
	ref: string,
	componentName: string,
	viewBox: string,
	svg: string,
	cssMode: CssMode,
): NamedIcon {
	const [set, name] = ref.split('/') as [string, string]
	const { body, attrs } = hoistPresentation(svg)
	return {
		ref: { set, name },
		body,
		attrs,
		viewBox,
		componentName,
		fileName: componentName
			.slice(4)
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.toLowerCase(),
		cssMode,
		license: { spdx: 'ISC' },
	}
}

const LUCIDE =
	'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
const lucide = (name: string, component: string, inner: string) =>
	named(
		`lucide/${name}`,
		component,
		'0 0 24 24',
		`<g ${LUCIDE}>${inner}</g>`,
		'mask',
	)

const house = lucide(
	'house',
	'IconHome',
	'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
)
const circleCheck = lucide(
	'circle-check',
	'IconCircleCheck',
	'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
)
const archive = lucide(
	'archive',
	'IconArchive',
	'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
)
const shapes = lucide(
	'shapes',
	'IconShapes',
	'<line x1="3" y1="21" x2="9" y2="15"/><polyline points="14 3 21 3 21 10"/><polygon points="3 3 10 3 3 10"/><ellipse cx="17" cy="17" rx="4" ry="2.5" stroke-width="1"/>',
)
const duotone = named(
	'ph/square',
	'IconSquare',
	'0 0 256 256',
	'<g fill="currentColor"><rect x="32" y="32" width="192" height="192" rx="8" opacity="0.2"/><path d="M40 40h176v176H40z" fill="none" stroke="currentColor" stroke-width="16"/></g>',
	'mask',
)
// A monochrome brand mark: unset fill (black) and an authored red both become
// currentColor at their own alpha in mask mode, as the CSS target masks them.
const brand = named(
	'simple-icons/demo',
	'IconBrand',
	'0 0 24 24',
	'<path d="M2 2h20v9H2z"/><path d="M2 13h20v9H2z" fill="#ff0000" opacity=".5"/>',
	'mask',
)
// Full color: gradients in both unit systems, a clip, a luminance mask, a
// transform, an own-color stroke and a fill+stroke group opacity.
const logo = named(
	'svgl/demo',
	'IconLogo',
	'0 0 64 64',
	`<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
<radialGradient id="r" cx="32" cy="32" r="20" gradientUnits="userSpaceOnUse" gradientTransform="translate(4 0)"><stop offset="0" stop-color="#fde047"/><stop offset="100%" style="stop-color:#16a34a;stop-opacity:.6"/></radialGradient>
<clipPath id="c"><circle cx="32" cy="32" r="28"/></clipPath>
<mask id="m"><rect width="64" height="64" fill="#fff"/><circle cx="46" cy="18" r="8" fill="#000"/></mask>
</defs>
<g clip-path="url(#c)"><rect width="64" height="64" fill="url(#g)"/></g>
<g mask="url(#m)" transform="rotate(15 32 32)"><rect x="16" y="16" width="32" height="32" rx="6" fill="url(#r)"/></g>
<path d="M8 56h48" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>
<circle cx="12" cy="12" r="5" fill="#111" stroke="currentColor" stroke-width="2" opacity=".8"/>`,
	'image',
)

const icons = [house, circleCheck, archive, shapes, duotone, brand, logo]

describe('iconTree', () => {
	test('stroke-only shapes merge, inheriting the root stroke width', () => {
		const { nodes, strokeWidth } = iconTree(house)
		expect(strokeWidth).toBe(2)
		expect(nodes).toHaveLength(1)
		expect(nodes[0]).toMatchObject({
			type: 'shape',
			stroke: { kind: 'color', color: { alpha: 1 } },
			cap: 'round',
			join: 'round',
		})
		expect(nodes[0]).not.toHaveProperty('strokeWidth')
		expect(nodes[0]).not.toHaveProperty('fill')
	})

	test("a stroke width set below the root is the shape's own", () => {
		const { nodes } = iconTree(shapes)
		expect(nodes).toHaveLength(2)
		expect(nodes[1]).toMatchObject({ strokeWidth: 1 })
	})

	test('opacity on a single paint folds into its alpha', () => {
		const { nodes } = iconTree(duotone)
		expect(nodes[0]).toMatchObject({
			fill: { kind: 'color', color: { alpha: 0.2 } },
		})
	})

	test('mask mode turns authored colors into currentColor at their alpha', () => {
		const { nodes } = iconTree(brand)
		const [black, red] = nodes.map((n) => n.type === 'shape' && n.fill)
		expect(black).toEqual({ kind: 'color', color: { alpha: 1 } })
		expect(red).toMatchObject({
			kind: 'color',
			color: { alpha: expect.closeTo(0.5, 2) },
		})
	})

	test('image mode keeps authored colors; bounding-box gradients bake the box', () => {
		const { nodes } = iconTree(logo)
		const [clipped, masked, line, dot] = nodes
		expect(clipped).toMatchObject({
			type: 'group',
			clip: [{ evenodd: false }],
			children: [
				{
					fill: {
						kind: 'linear',
						x1: 0,
						y2: 1,
						transform: [64, 0, 0, 64, 0, 0],
					},
				},
			],
		})
		expect(masked).toMatchObject({
			type: 'group',
			mask: { alpha: false },
			children: [
				{
					fill: {
						kind: 'radial',
						cx: 32,
						r: 20,
						transform: [1, 0, 0, 1, 4, 0],
					},
				},
			],
		})
		expect(line).toMatchObject({
			stroke: { color: { argb: 0xff0ea5e9 } },
			strokeWidth: 4,
		})
		// Fill and stroke under one opacity composite first: a layer.
		expect(dot).toMatchObject({ type: 'group', opacity: 0.8 })
	})

	test('what Flutter cannot draw fails with the ref and the reason', () => {
		const broken = (body: string) =>
			named('svgl/broken', 'IconBroken', '0 0 24 24', body, 'image')
		expect(() =>
			dartRenderer.render([
				broken(
					'<defs><filter id="f"><feOffset dx="1"/><feGaussianBlur stdDeviation="2"/></filter></defs><path d="M0 0h1v1z" filter="url(#f)"/>',
				),
			]),
		).toThrow(
			'svgl/broken: filter <feOffset> <feGaussianBlur> is not supported',
		)
		expect(() =>
			dartRenderer.render([
				broken('<style>.a{fill:red}</style><path class="a" d="M0 0h1"/>'),
			]),
		).toThrow('<style> is not supported')
		expect(() =>
			dartRenderer.render([broken('<path d="M0 0h1" stroke-dasharray="2"/>')]),
		).toThrow('<path stroke-dasharray> is not supported')
	})
})

describe('dart output', () => {
	const [file] = dartRenderer.render(icons)
	const dart = file!.content

	test('one const per icon, named after the web component', () => {
		expect(dart).toContain("const iconHome = SigilIconData(\n  'lucide/house',")
		expect(dart).toContain('/// lucide/house · ISC')
		expect(dart).toContain(
			'  viewBox: Rect.fromLTWH(0, 0, 24, 24),\n  strokeWidth: 2,',
		)
		expect(dart).toContain(
			'SigilShape(_iconHome0, stroke: SigilPaint.current, strokeCap: StrokeCap.round, strokeJoin: StrokeJoin.round)',
		)
	})

	test('shapes become Path commands at etch time', () => {
		// The circle: two arcs, SVG's sweep flag 0 is counterclockwise.
		expect(dart).toContain(
			'Path _iconCircleCheck0() => Path()\n  ..moveTo(2, 12)\n  ..arcToPoint(const Offset(22, 12), radius: const Radius.circular(10), largeArc: true, clockwise: false)',
		)
		expect(dart).not.toMatch(/\bd: '|parseSvg|flutter_svg/)
	})

	test('depends on nothing but package:flutter/widgets.dart', () => {
		expect(dart.match(/^import .*$/gm)).toEqual([
			"import 'package:flutter/widgets.dart';",
		])
	})

	test('the formatter leaves generated code alone', () => {
		expect(dart.split('\n')[1]).toBe('// dart format off')
	})

	test('atlas sidecar imports the icon library', () => {
		const [, atlas] = dartRenderer.render(icons, {
			atlas: true,
			atlasFileName: 'app_icons.atlas.dart',
			atlasImportPath: 'app_icons.dart',
		})
		expect(atlas!.path).toBe('app_icons.atlas.dart')
		expect(atlas!.content).toContain("import 'app_icons.dart';")
		expect(atlas!.content).toContain(
			"SigilIconAtlasItem('house', 'iconHome', iconHome),",
		)
		expect(atlas!.content).toContain(
			'class SigilIconAtlas extends StatefulWidget',
		)
	})

	test('modules: a shell, one snake_case library per icon and a sorted barrel', () => {
		const one = named(
			'svgl/1password',
			'Icon1password',
			'0 0 24 24',
			'<path d="M0 0h24v24H0z"/>',
			'image',
		)
		const files = Object.fromEntries(
			dartRenderer.renderModules!([house, one]).map((f) => [f.path, f.content]),
		)
		expect(Object.keys(files).sort()).toEqual([
			'_shell.dart',
			'home.dart',
			'icon_1password.dart',
			'index.dart',
		])
		expect(files['_shell.dart']).toContain(
			'class SigilIcon extends StatelessWidget',
		)
		expect(files['home.dart']).toContain("import '_shell.dart';")
		expect(files['home.dart']).not.toContain('class SigilIcon ')
		expect(files['index.dart']).toContain(
			"export '_shell.dart';\nexport 'home.dart';\nexport 'icon_1password.dart';\n",
		)
	})
})

const ANALYSIS = `include: package:flutter_lints/flutter.yaml
analyzer:
  language:
    strict-casts: true
    strict-inference: true
    strict-raw-types: true
linter:
  rules:
    - always_declare_return_types
    - avoid_redundant_argument_values
    - directives_ordering
    - discarded_futures
    - prefer_const_constructors
    - prefer_final_locals
    - prefer_single_quotes
    - public_member_api_docs
    - type_annotate_public_apis
    - unawaited_futures
    - unnecessary_const
`

const PIXELS = 96

// Paints every icon with SigilIcon and compares it with librsvg's rendering of
// the same SVG, both composited over white. Antialiasing differs between the
// two rasterizers, so a pixel only counts as wrong when a channel is off by
// more than 48 of 255.
const MATCH_TEST = `import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:fixture/icons.atlas.dart';
import 'package:fixture/icons.dart';
import 'package:fixture/modules/index.dart' as modules;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

const ink = Color(0xFF2563EB);
const px = ${PIXELS};

String fileOf(String identifier) => identifier
    .substring(4)
    .replaceAllMapped(RegExp('([a-z0-9])([A-Z])'), (m) => '\${m[1]}-\${m[2]}')
    .toLowerCase();

double over(ByteData b, int i, int c, [Color? tint]) {
  final value = tint == null ? b.getUint8(i + c) : ((c == 0 ? tint.r : c == 1 ? tint.g : tint.b) * 255);
  return value * b.getUint8(i + 3) / 255 + 255 - b.getUint8(i + 3);
}

void main() {
  testWidgets('every icon paints like its SVG', (tester) async {
    // Mask-mode sets paint like the CSS target: the SVG's alpha in currentColor.
    final masked = File('ref/mask.txt').readAsLinesSync().toSet();
    final failures = <String>[];
    for (final item in sigilIconAtlasItems) {
      final key = GlobalKey();
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: RepaintBoundary(
              key: key,
              child: SigilIcon(item.icon, size: px.toDouble(), color: ink),
            ),
          ),
        ),
      );
      final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final (actual, expected) = (await tester.runAsync(() async {
        final image = await boundary.toImage();
        final raw = await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
        final codec = await ui.instantiateImageCodec(
          File('ref/\${fileOf(item.identifier)}.png').readAsBytesSync(),
        );
        final frame = await codec.getNextFrame();
        final ref = await frame.image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
        return (raw!, ref!);
      }))!;
      var bad = 0;
      for (var i = 0; i < px * px * 4; i += 4) {
        for (var c = 0; c < 3; c++) {
          final tint = masked.contains(item.ref) ? ink : null;
          if ((over(actual, i, c) - over(expected, i, c, tint)).abs() > 48) {
            bad++;
            break;
          }
        }
      }
      final percent = bad * 100 / (px * px);
      if (percent > 1) failures.add('\${item.ref}: \${percent.toStringAsFixed(2)}% of pixels differ');
    }
    expect(failures, isEmpty);
  });

  testWidgets('size and strokeWidth follow the widget, color the text', (tester) async {
    await tester.pumpWidget(
      const Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: DefaultTextStyle(
            style: TextStyle(color: ink),
            child: modules.SigilIcon(modules.iconHome, size: 16, strokeWidth: 1.5),
          ),
        ),
      ),
    );
    expect(tester.getSize(find.byType(modules.SigilIcon)), const Size(16, 16));
    final paint = tester.widget<CustomPaint>(find.byType(CustomPaint));
    final painter = paint.painter! as modules.SigilIconPainter;
    expect(painter.color, ink);
    expect(painter.strokeWidth, 1.5);
  });

  testWidgets('the atlas filters, selects and empties', (tester) async {
    SigilIconAtlasItem? picked;
    await tester.pumpWidget(
      WidgetsApp(
        color: const Color(0xFFFFFFFF),
        builder: (context, _) => SigilIconAtlas(onSelect: (item) => picked = item),
      ),
    );
    final total = sigilIconAtlasItems.length;
    expect(find.text('$total of $total icons'), findsOneWidget);
    await tester.enterText(find.byType(EditableText), 'circle');
    await tester.pump();
    expect(find.text('1 of $total icons'), findsOneWidget);
    await tester.tap(find.text('circle-check'));
    expect(picked?.ref, 'lucide/circle-check');
    await tester.enterText(find.byType(EditableText), 'zzz');
    await tester.pump();
    expect(find.text('No icons match your search.'), findsOneWidget);
  });
}
`

const flutter = Bun.which('flutter')
const rsvg = Bun.which('rsvg-convert')

// The generated library is only useful if it compiles clean under a strict
// analyzer and paints what the SVG paints, so etch a fixture package, analyze
// it and let Flutter's own renderer prove the pixels.
test.skipIf(!flutter || !rsvg)(
	'etched Dart analyzes clean and paints like the SVG',
	() => {
		const dir = join(root, '.scratch/dart-render')
		rmSync(dir, { recursive: true, force: true })
		mkdirSync(join(dir, 'lib/modules'), { recursive: true })
		mkdirSync(join(dir, 'test'), { recursive: true })
		mkdirSync(join(dir, 'ref'), { recursive: true })
		const files = dartRenderer.render(icons, {
			atlas: true,
			atlasFileName: 'icons.atlas.dart',
			atlasImportPath: 'icons.dart',
		})
		for (const file of files)
			writeFileSync(join(dir, 'lib', file.path), file.content)
		for (const file of dartRenderer.renderModules!(icons)) {
			writeFileSync(join(dir, 'lib/modules', file.path), file.content)
		}
		for (const file of svgRenderer.render(icons)) {
			const svg = file.content
				.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
				.replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
				.replace(
					'<svg ',
					`<svg width="${PIXELS}" height="${PIXELS}" color="#2563EB" `,
				)
			const path = join(dir, 'ref', file.path)
			writeFileSync(path, svg)
			const r = Bun.spawnSync([
				rsvg!,
				path,
				'-o',
				path.replace(/\.svg$/, '.png'),
			])
			expect(r.stderr.toString()).toBe('')
		}
		writeFileSync(
			join(dir, 'ref/mask.txt'),
			icons
				.filter((icon) => icon.cssMode === 'mask')
				.map((icon) => `${icon.ref.set}/${icon.ref.name}`)
				.join('\n'),
		)
		writeFileSync(
			join(dir, 'pubspec.yaml'),
			`name: fixture
publish_to: none
environment:
  sdk: ^3.10.0
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_lints: ^6.0.0
  flutter_test:
    sdk: flutter
`,
		)
		writeFileSync(join(dir, 'analysis_options.yaml'), ANALYSIS)
		writeFileSync(join(dir, 'test/icons_test.dart'), MATCH_TEST)

		const sh = (cmd: string[]) => {
			const p = Bun.spawnSync(cmd, {
				cwd: dir,
				env: { ...process.env, CI: 'true' },
			})
			return {
				code: p.exitCode,
				out: p.stdout.toString() + p.stderr.toString(),
			}
		}
		const get = sh([flutter!, 'pub', 'get'])
		expect(get.code, get.out).toBe(0)
		const analyze = sh([flutter!, 'analyze', '--no-pub'])
		expect(analyze.out).toContain('No issues found!')
		const run = sh([flutter!, 'test', '--no-pub'])
		expect(run.out).toContain('All tests passed!')
	},
	300_000,
)
