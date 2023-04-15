export const formatNumber = (x) => { // convert to k, m , etc.
	if (x < 1000) {
		return x;
	}
	if (x < 1000000) {
		return (x / 1000).toFixed(2) + "k";
	}
	return (x / 1000000).toFixed(2) + "m";
}

export const formatShortTime = (unix) => {
	const date = new Date(unix * 1000);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	if (year === new Date().getFullYear()) {
		return `${month}/${day}`;
	}
	return `${year.toString().slice(2)}/${month}/${day}`;
}

export const getSetting = (option, defaultValue = '') => {
	option = "plugin-market-" + option;
	let value = localStorage.getItem(option);
	if (!value) {
		value = defaultValue;
	}
	if (value === 'true') {
		value = true;
	} else if (value === 'false') {
		value = false;
	}
	return value;
}
export const setSetting = (option, value) => {
	option = "plugin-market-" + option;
	localStorage.setItem(option, value);
}

export const useRefState = (initialValue) => {
	const [value, setValue] = React.useState(initialValue);
	const ref = React.useRef(value);
	React.useEffect(() => {
		ref.current = value;
	}, [value]);
	return [value, setValue, ref];
}