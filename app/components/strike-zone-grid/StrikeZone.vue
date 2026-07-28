<script setup lang="ts">
import type { PitchLocation, StrikeZone } from './core/types'
import type { FieldLayoutOptions } from './core/useStrikeZoneScale'
import { computed } from 'vue'
import { createFieldLayout, isStrike, useStrikeZoneScale } from './core/useStrikeZoneScale'

const props = withDefaults(
  defineProps<{
    /** The batter's measured strike zone (drives the grid height). */
    zone: StrikeZone
    /** Pitch landing points to plot. */
    pitches?: PitchLocation[]
    /** Padding around the zone as a fraction of its size. Default 0.5. */
    paddingFraction?: number
    /** Show the 1-9 cell numbers. */
    showLabels?: boolean
    /** Draw the decorative home plate + batter's boxes below the zone. */
    showField?: boolean
    /** Perspective / sizing overrides for the field (plate + batter's boxes). */
    fieldOptions?: FieldLayoutOptions
    /** Radius of a plotted pitch, in SVG units. */
    pitchRadius?: number
  }>(),
  {
    pitches: () => [],
    paddingFraction: 0.6,
    showLabels: false,
    showField: false,
    fieldOptions: () => ({}),
    pitchRadius: 5,
  },
)

const scale = useStrikeZoneScale(
  () => props.zone,
  () => ({ paddingFraction: props.paddingFraction }),
)

// The field is a schematic decoration in a reserved band below the zone; when
// shown it extends the viewBox height so the plate/boxes have room.
const field = computed(() => (props.showField ? createFieldLayout(scale.value, props.fieldOptions) : null))
const viewHeight = computed(() => field.value?.totalHeight ?? scale.value.viewHeight)

const points = computed(() =>
  props.pitches.map((pitch, index) => {
    const { x, y } = scale.value.toSvg(pitch.px, pitch.pz)
    return { index, pitch, x, y, strike: isStrike(scale.value, pitch) }
  }),
)
</script>

<template>
  <svg
    class="h-auto w-full select-none"
    :viewBox="`0 0 ${scale.viewWidth} ${viewHeight}`"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="Strike zone"
    data-testid="strike-zone"
  >
    <!-- Nine-grid cells (hit targets + optional labels) -->
    <g data-testid="strike-zone-grid">
      <g v-for="cell in scale.cells" :key="cell.number">
        <rect
          :x="cell.x"
          :y="cell.y"
          :width="cell.width"
          :height="cell.height"
          fill="transparent"
          :data-testid="`strike-zone-cell-${cell.number}`"
        />
        <text
          v-if="showLabels"
          :x="cell.cx"
          :y="cell.cy"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="10"
          class="fill-neutral-300"
        >
          {{ cell.number }}
        </text>
      </g>

      <!-- Internal grid lines -->
      <line
        v-for="(line, i) in scale.verticalLines"
        :key="`v-${i}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        class="stroke-neutral-400"
        stroke-width="1"
      />
      <line
        v-for="(line, i) in scale.horizontalLines"
        :key="`h-${i}`"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        class="stroke-neutral-400"
        stroke-width="1"
      />

      <!-- Outer border -->
      <rect
        :x="scale.zoneRect.x"
        :y="scale.zoneRect.y"
        :width="scale.zoneRect.width"
        :height="scale.zoneRect.height"
        fill="none"
        class="stroke-neutral-600"
        stroke-width="1.5"
      />
    </g>

    <!-- Decorative field context: home plate + batter's boxes -->
    <g
      v-if="field"
      data-testid="strike-zone-field"
      fill="none"
      class="stroke-neutral-400"
      stroke-width="1.5"
      stroke-linejoin="round"
    >
      <polyline :points="field.leftBox" data-testid="batter-box-left" />
      <polyline :points="field.rightBox" data-testid="batter-box-right" />
      <polygon :points="field.homePlate" data-testid="home-plate" class="stroke-neutral-600" />
    </g>

    <!-- Pitch landing points -->
    <g data-testid="strike-zone-pitches">
      <circle
        v-for="p in points"
        :key="p.index"
        :cx="p.x"
        :cy="p.y"
        :r="pitchRadius"
        :class="p.strike ? 'fill-primary-500 stroke-primary-700' : 'fill-error-400 stroke-error-600'"
        stroke-width="1"
        :data-testid="`pitch-point-${p.index}`"
        :data-strike="p.strike"
      >
        <title>{{ p.pitch.description ?? `px=${p.pitch.px}, pz=${p.pitch.pz}` }}</title>
      </circle>
    </g>
  </svg>
</template>
