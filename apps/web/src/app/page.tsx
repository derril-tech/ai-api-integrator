export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">AI API Integrator</h1>
      </div>

      <div className="relative flex place-items-center">
        <h2 className="text-2xl font-semibold">
          Generate production-ready API integrations from documentation
        </h2>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100">
          <h3 className="mb-3 text-xl font-semibold">
            Spec Viewer
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Upload and visualize API specifications
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100">
          <h3 className="mb-3 text-xl font-semibold">
            Code Generator
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Generate TypeScript SDKs and server adapters
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100">
          <h3 className="mb-3 text-xl font-semibold">
            Workflow Builder
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Create and manage API integration workflows
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100">
          <h3 className="mb-3 text-xl font-semibold">
            Export & Deploy
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Export complete integration repositories
          </p>
        </div>
      </div>
    </main>
  )
}
