export const config = {
  validate() {
    const apiKey = process.env.AIRLABS_API_KEY;
    if (!apiKey) {
      throw new Error("AIRLABS_API_KEY is missing");
    }
    return apiKey;
  }
};
