export const config = {
  get airlabsApiKey() {
    return process.env.AIRLABS_API_KEY;
  },
  validate() {
    if (!this.airlabsApiKey) {
      console.error("AIRLABS_API_KEY is missing in environment");
      throw new Error("AIRLABS_API_KEY is missing");
    }
    return this.airlabsApiKey;
  }
};
