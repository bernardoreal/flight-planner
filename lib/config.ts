export const config = {
  getAirLabsKey() {
    const key = process.env.AIRLABS_API_KEY || process.env.NEXT_PUBLIC_AIRLABS_API_KEY;
    return key;
  }
};
