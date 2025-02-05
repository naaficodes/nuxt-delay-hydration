import { dirname, join, resolve } from 'upath'
import { addTemplate, defineNuxtModule } from '@nuxt/kit'
import type { ModuleOptions } from './interfaces'
import { CONFIG_KEY, MODE_DELAY_APP_INIT, MODE_DELAY_APP_MOUNT, MODE_DELAY_MANUAL, NAME } from './constants'
import templateUtils from './util/template'
import logger from './logger'

const nuxtDelayHydration = defineNuxtModule<ModuleOptions>({
  meta: {
    name: NAME,
    configKey: CONFIG_KEY,
  },
  // support @nuxt/kit legacy
  // @ts-ignore
  configKey: CONFIG_KEY,
  // @ts-ignore
  name: NAME,
  defaults: {
    mode: false,
    hydrateOnEvents: [
      'mousemove',
      'scroll',
      'keydown',
      'click',
      'touchstart',
      'wheel',
    ],
    postIdleTimeout: {
      mobile: 6000,
      desktop: 5000,
    },
    idleCallbackTimeout: 7000,
    forever: false,
    debug: false,
    replayClick: false,
    replayClickMaxEventAge: 1000,
  } as ModuleOptions,
  setup: (config: ModuleOptions, nuxt) => {
    if (!config.mode) {
      logger.info(`\`${NAME}\` mode set to \`${config.mode}\`, disabling module.`)
      return
    }
    if (!nuxt.options.ssr) {
      logger.warn(`\`${NAME}\` will only work for SSR apps, disabling module.`)
      return
    }
    // @ts-ignore
    if (nuxt.options.vite && !nuxt.options.vite?.ssr) {
      logger.warn(`\`${NAME}\` only works with vite with SSR enabled, disabling module.`)
      return
    }
    if (!config.debug && nuxt.options.dev) {
      logger.info(`\`${NAME}\` only runs in dev with \`debug\` enabled, disabling module.`)
      return
    }
    if (config.debug && !nuxt.options.dev)
      logger.warn(`\`${NAME}\` debug enabled in a non-development environment.`)
    if (nuxt.options.target !== 'static')
      logger.warn(`\`${NAME}\` is untested in a non-static mode, use with caution.`)

    nuxt.hook('build:before', () => {
      if (process.env.NODE_ENV !== 'test')
        logger.info(`\`${NAME}\` enabled with \`${config.mode}\` mode ${config.debug ? '[Debug enabled]' : ''}`)
      // enable asyncScripts
      // @ts-ignore
      nuxt.options.render.asyncScripts = true
    })

    const delayHydrationPath = join('hydration', 'hydrationRace.js')
    const replayPointerEventPath = join('hydration', 'replayPointerEvent.js')

    addTemplate({
      src: join(resolve(__dirname, 'runtime', 'template', 'delayHydration.js')),
      fileName: delayHydrationPath,
      options: config,
    })

    if (config.replayClick) {
      addTemplate({
        src: resolve(join(__dirname, 'runtime', 'template', 'replayPointerEvent.js')),
        fileName: replayPointerEventPath,
        options: config,
      })
    }

    /**
     * Extend Nuxt components, add our component directory.
     */
    nuxt.hook('components:dirs', (dirs: {path: string; ignore?: string[]}[]) => {
      dirs.push({
        path: resolve(join(__dirname, 'components')),
        ignore: ['index.js'],
      })
    })

    if (config.mode === MODE_DELAY_MANUAL) {
      addTemplate({
        src: resolve(join(__dirname, 'runtime', 'plugin', 'injectDelayHydrationApi.js')),
        fileName: join('hydration', 'pluginDelayHydration.client.js'),
        options: config,
      })
    }

    const utils = templateUtils({ publishPath: join(dirname(__dirname), '.runtime') })

    if (config.mode === MODE_DELAY_APP_INIT || config.mode === MODE_DELAY_APP_MOUNT) {
      /**
       * Hook into the template builder, inject the hydration delayer module.
       */
      // @ts-ignore
      nuxt.hook('build:templates', ({ templateVars, templatesFiles }) => {
        if (config.mode === MODE_DELAY_APP_MOUNT) {
          // @ts-ignore
          const template = utils.matchTemplate(templatesFiles, 'client')
          if (!template)
            return

          templateVars.delayHydrationPath = delayHydrationPath
          templateVars.replayPointerEventPath = replayPointerEventPath
          templateVars.hydrationConfig = config
          // import statement
          template.injectFileContents(
            join(__dirname, 'runtime', 'templateInjects', 'import.js'),
            'import Vue from \'vue\'',
          )
          // actual delayer
          template.injectFileContents(
            join(__dirname, 'runtime', 'templateInjects', 'delayHydrationRace.js'),
            'async function mountApp (__app) {',
          )
          template.publish()
          return
        }

        if (config.mode === MODE_DELAY_APP_INIT) {
          // @ts-ignore
          const template = utils.matchTemplate(templatesFiles, 'index')
          if (!template)
            return

          templateVars.delayHydrationPath = delayHydrationPath
          templateVars.replayPointerEventPath = replayPointerEventPath
          templateVars.hydrationConfig = config
          // import statement
          template.injectFileContents(
            join(__dirname, 'runtime', 'templateInjects', 'import.js'),
            'import Vue from \'vue\'',
          )
          // actual delayer
          template.injectFileContents(
            join(__dirname, 'runtime', 'templateInjects', 'delayHydrationRace.js'),
            'async function createApp(ssrContext, config = {}) {',
          )
          template.publish()
        }
      })
    }
  },
})

export default nuxtDelayHydration
