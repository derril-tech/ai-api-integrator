import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import ReadOnlySpecViewer from '@/components/spec-viewer/ReadOnlySpecViewer';

interface PublicSharePageProps {
  token: string;
  metadata?: {
    title: string;
    version: string;
    description?: string;
  };
  error?: string;
}

export default function PublicSharePage({ token, metadata, error }: PublicSharePageProps) {
  const router = useRouter();

  if (error) {
    return (
      <>
        <Head>
          <title>Share Not Found - AI API Integrator</title>
          <meta name="description" content="The requested shared specification could not be found." />
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">Share Not Found</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>
          {metadata ? `${metadata.title} v${metadata.version} - Shared API Specification` : 'Shared API Specification'}
        </title>
        <meta 
          name="description" 
          content={
            metadata?.description || 
            `View the shared API specification for ${metadata?.title || 'this API'}`
          } 
        />
        <meta name="robots" content="noindex, nofollow" />
        
        {/* Open Graph tags for better sharing */}
        <meta property="og:title" content={metadata ? `${metadata.title} API Specification` : 'Shared API Specification'} />
        <meta property="og:description" content={metadata?.description || 'View this shared API specification'} />
        <meta property="og:type" content="website" />
        
        {/* Prevent caching of shared content */}
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        
        {/* Security headers */}
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
      </Head>
      
      <ReadOnlySpecViewer shareToken={token} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { token } = context.params!;
  
  if (!token || typeof token !== 'string') {
    return {
      props: {
        token: '',
        error: 'Invalid share token',
      },
    };
  }

  try {
    // Pre-fetch metadata for SEO (optional)
    // In a real implementation, you might want to fetch basic metadata server-side
    // for better SEO and social sharing, while keeping the full spec client-side
    
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/share/token/${token}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          props: {
            token,
            error: 'This share link is invalid or has expired',
          },
        };
      }
      throw new Error('Failed to load shared specification');
    }

    const data = await response.json();
    
    return {
      props: {
        token,
        metadata: data.metadata,
      },
    };
  } catch (error) {
    // If server-side fetch fails, still render the page and let client-side handle it
    return {
      props: {
        token,
        // Don't pass the error, let client-side handle the API call
      },
    };
  }
};
