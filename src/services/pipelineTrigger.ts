import axios from 'axios';

export class PipelineTrigger {
  private static readonly PIPELINE_URL = process.env.PIPELINE_SERVICE_URL || 'http://localhost:8001';
  
  static async processClaim(claimId: number): Promise<void> {
    try {
      console.log(`Triggering pipeline for claim ${claimId}`);
      
      const response = await axios.post(`${this.PIPELINE_URL}/process-claim`, {
        claim_id: claimId
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });
      
      console.log(`Pipeline response for claim ${claimId}:`, response.data);
    } catch (error) {
      console.error(`Failed to trigger pipeline for claim ${claimId}:`, error);
      // Don't throw - pipeline failures shouldn't break the API
    }
  }
  
  static async processMultipleClaims(claimIds: number[]): Promise<void> {
    try {
      console.log(`Triggering pipeline for ${claimIds.length} claims`);

     const response = await axios.post(`${this.PIPELINE_URL}/process_claim/${claimId}`, {}, {
         headers: {
           'Content-Type': 'application/json'
         },      
        timeout: 60000 // 60 second timeout for batch
      });
      
      console.log(`Batch pipeline response:`, response.data);
    } catch (error) {
      console.error(`Failed to trigger batch pipeline:`, error);
    }
  }
  
  static async regenerateGraph(): Promise<void> {
    try {
      console.log('Triggering full graph regeneration');
      
      const response = await axios.post(`${this.PIPELINE_URL}/regenerate-graph`, {}, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minute timeout for full regeneration
      });
      
      console.log('Graph regeneration response:', response.data);
    } catch (error) {
      console.error('Failed to regenerate graph:', error);
      throw error; // Rethrow for regeneration failures
    }
  }
  
  // Queue-based processing for better performance
  private static claimQueue: number[] = [];
  private static queueTimer: NodeJS.Timeout | null = null;
  
  static async queueClaim(claimId: number): Promise<void> {
    this.claimQueue.push(claimId);
    
    // Debounce - process queue after 1 second of no new claims
    if (this.queueTimer) {
      clearTimeout(this.queueTimer);
    }
    
    this.queueTimer = setTimeout(() => {
      const claims = [...this.claimQueue];
      this.claimQueue = [];
      this.queueTimer = null;
      
      if (claims.length === 1) {
        this.processClaim(claims[0]);
      } else if (claims.length > 1) {
        this.processMultipleClaims(claims);
      }
    }, 1000);
  }
  
  // Health check for pipeline service
  static async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.PIPELINE_URL}/health`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      console.error('Pipeline service health check failed:', error);
      return false;
    }
  }
}
