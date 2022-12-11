export const formatNumber = (x) => { // convert to k, m , etc.
	if (x < 1000) {
		return x;
	}
	if (x < 1000000) {
		return (x / 1000).toFixed(2) + "k";
	}
	return (x / 1000000).toFixed(2) + "m";
}